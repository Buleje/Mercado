import { NextResponse } from "next/server";
import { z } from "zod";
import { withCronAuth } from "@/lib/cron-auth";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothChequeoDB } from "@/lib/db/forest-loth-chequeo.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { sendReporteDiario } from "@/lib/email/resend";
import { registrarEnvioCorreo } from "@/lib/avisos-correo";
import { enmascararCorreo } from "@/lib/avisos-correo-tipos";
import { enviarWhatsAppDelNegocio, viaDelWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { describirEnvioWhatsApp, sufijoDeFallo, telefonoParaWa, type ViaEnvioWa } from "@/lib/whatsapp/aviso-plantilla";
import { enmascararTelefono } from "@/lib/asistente/mandar-papel";
import { correoDelChequeoDeHoy, destinoDelCorreoChequeo } from "@/lib/forestal/loth-chequeo-correo-server";
import { planearCorreoChequeo, registroCambia, URL_CHEQUEO_TH } from "@/lib/forestal/loth-chequeo-correo";
import { logger } from "@/lib/logger";

/**
 * El aviso del chequeo del Libro TH (26-10, Brandon: «que el chequeo te mande
 * un correo el día que aparece algo que puede multar»; «que también llegue por
 * WhatsApp y a la campana, como el de vencimiento del plan»). Corre 07:00 de Lima.
 *
 * Por cada negocio con el Libro TH (`spec:forestal:loth-libro`): corre el
 * chequeo avanzado y avisa sólo si hay algo NUEVO que puede multar (severidad
 * multa, una advertencia con plazo a 7 días o menos, o el último día de ese
 * plazo). Qué es nuevo y la caducidad: `loth-chequeo-correo`.
 *
 * Canales: los mismos que `loth-plan-vencimiento` — campana del panel (con
 * «Abrir el chequeo»), WhatsApp del negocio al celular del dueño y su correo.
 * El interruptor «forestal» de Avisos por correo apaga SÓLO el correo; sin
 * correo ni WhatsApp, la campana sale igual.
 *
 * Lo avisado se SELLA sólo si llegó por algún lado: un WhatsApp o un correo que
 * salió, o —si el negocio no tiene ningún canal VIVO— la campana. Canal vivo =
 * un WhatsApp configurado o un correo con el interruptor prendido. Si un canal
 * vivo falló, no se sella y mañana se reintenta; la campana del mismo aviso se
 * reusa mientras siga sin leer (`DEDUP_CAMPANA_HORAS`). Cada envío queda en
 * NotificationLog.
 *
 * Un negocio que falla no corta a los demás.
 *
 * `?probar=1` (o `?ensayo=1`): devuelve lo que saldría HOY por cada canal
 * (campana, WhatsApp con el celular enmascarado, correo con su HTML) SIN enviar
 * nada ni tocar el registro. `&tenantId=` lo limita a un negocio.
 */

const QuerySchema = z.object({
  probar: z.enum(["0", "1"]).optional(),
  ensayo: z.enum(["0", "1"]).optional(),
  tenantId: z.string().trim().min(1).max(64).optional(),
});

/** Una campana por aviso mientras siga sin leer: el reintento de mañana no la repite. */
const DEDUP_CAMPANA_HORAS = 24 * 30;
const ABRIR_CHEQUEO = "Abrir el chequeo";
const PRESUPUESTO_MS = 100_000;

interface Ensayo {
  tenantId: string;
  negocio: string | null;
  avisos: number;
  nuevos: number;
  /** Por qué hoy no sale nada; `null` = sale. */
  motivo: string | null;
  sinLeer: string[];
  campana: { titulo: string; cuerpo: string; severidad: string; enlace: string; boton: string } | null;
  whatsapp: { sale: boolean; destino: string | null; via: ViaEnvioWa | null; motivo: string | null; texto: string | null };
  correo: { sale: boolean; destino: string | null; motivo: string | null; asunto: string | null; html: string | null };
}

async function registrar(tenantId: string, destino: string, ok: boolean, detalle: string) {
  await NotificationLogsDB.add(
    { type: "loth_chequeo_whatsapp", recipient: destino, status: ok ? "sent" : "failed", message: detalle.slice(0, 500) },
    tenantId,
  ).catch((err) =>
    logger.error("[cron/loth-chequeo-correo] no se pudo registrar el envío", { tenantId, err: String(err).slice(0, 200) }),
  );
}

const tapado = (telefono: string | null) => (telefono ? enmascararTelefono(telefonoParaWa(telefono)) : null);

export const GET = withCronAuth("loth-chequeo-correo", async (req) => {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  const probar = parsed.data.probar === "1" || parsed.data.ensayo === "1";
  const soloTenant = parsed.data.tenantId ?? null;
  const ahora = Date.now();
  const r = {
    probar,
    revisados: 0,
    sinEspecialidad: 0,
    sinNovedad: 0,
    conAviso: 0,
    campanas: 0,
    whatsappEnviados: 0,
    whatsappFallidos: 0,
    whatsappSinConfigurar: 0,
    correosEnviados: 0,
    correosFallidos: 0,
    correosOmitidos: 0,
    sinCorreo: 0,
    sinCanal: 0,
    /** Casos sellados (no se vuelven a avisar). */
    sellados: 0,
    fallaron: 0,
    /** Negocios que quedaron para mañana por el tope de tiempo. */
    pendientes: 0,
    ensayo: [] as Ensayo[],
  };

  const tenants = await ForestLothDB.tenantsConLibroTh();
  for (const [i, tenantId] of tenants.entries()) {
    if (soloTenant && tenantId !== soloTenant) continue;
    /* Tope de tiempo (~6-10 s por negocio; `maxDuration` 120 s en vercel.json): cortar a
       los 100 s con registro, no a ciegas por Vercel. Lo que queda se avisa mañana
       (nada se sella sin avisar). */
    if (Date.now() - ahora > PRESUPUESTO_MS) {
      r.pendientes = tenants.length - i;
      logger.warn("[cron/loth-chequeo-correo] tope de tiempo: quedan negocios para mañana", { pendientes: r.pendientes });
      break;
    }
    r.revisados += 1;
    try {
      if (!(await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"))) {
        r.sinEspecialidad += 1;
        continue;
      }
      const destino = await destinoDelCorreoChequeo(tenantId);
      const d = await correoDelChequeoDeHoy(tenantId, destino.negocio, ahora);
      const motivoCorreo = !destino.correo ? "falta el correo del negocio" : !destino.activo ? "los avisos forestales por correo están apagados" : null;

      if (probar) {
        const via = destino.telefono ? await viaDelWhatsAppDelNegocio(tenantId, "loth_chequeo") : null;
        const motivoWa = !destino.telefono ? "falta el celular del dueño" : via == null ? "el WhatsApp del negocio no está configurado" : null;
        const motivo = d.correo ? null : d.plan.avisos.length > 0 ? "ya te avisé todo lo de hoy" : "nada que pueda multarte";
        r.ensayo.push({
          tenantId,
          negocio: destino.negocio,
          avisos: d.plan.avisos.length,
          nuevos: d.plan.nuevos.length,
          motivo,
          sinLeer: d.chequeo.sinLeer,
          campana: d.campana
            ? { titulo: d.campana.titulo, cuerpo: d.campana.cuerpo, severidad: d.campana.severidad, enlace: URL_CHEQUEO_TH, boton: ABRIR_CHEQUEO }
            : null,
          whatsapp: { sale: !motivo && !motivoWa, destino: tapado(destino.telefono), via, motivo: motivo ?? motivoWa, texto: d.whatsapp },
          correo: {
            sale: !motivo && !motivoCorreo,
            destino: enmascararCorreo(destino.correo),
            motivo: motivo ?? motivoCorreo,
            asunto: d.correo?.asunto ?? null,
            html: d.correo?.html ?? null,
          },
        });
        continue;
      }

      let sellar = false;
      if (!d.correo || !d.campana || !d.whatsapp) {
        r.sinNovedad += 1;
      } else {
        r.conAviso += 1;
        const n = await NotificationCenterDB.createOrReuse({
          tenantId,
          // El mismo tipo que los avisos de plazos del libro: cae en «Campo» con su ícono; el entityId lo separa.
          type: "LOTH_PLAZO_SERFOR",
          entityId: d.campana.entityId,
          severity: d.campana.severidad,
          title: d.campana.titulo,
          body: d.campana.cuerpo,
          actionUrl: URL_CHEQUEO_TH,
          actionLabel: ABRIR_CHEQUEO,
          dedupWindowHours: DEDUP_CAMPANA_HORAS,
        });
        if (n.created) r.campanas += 1;

        let llego = false;
        /* Vivo = un canal que, si falló hoy, puede andar mañana (ver cabecera). */
        let canalVivo = false;
        const sinCanal: string[] = [];

        if (destino.telefono) {
          const wa = await enviarWhatsAppDelNegocio(tenantId, destino.telefono, d.whatsapp, { contexto: "loth_chequeo" });
          if (wa.ok) {
            llego = true;
            canalVivo = true;
            r.whatsappEnviados += 1;
            await registrar(tenantId, destino.telefono, true, `${d.campana.titulo} · ${describirEnvioWhatsApp(wa)}`);
          } else if (wa.via == null) {
            r.whatsappSinConfigurar += 1;
            sinCanal.push("el WhatsApp del negocio no está configurado");
          } else {
            canalVivo = true;
            r.whatsappFallidos += 1;
            logger.error("[cron/loth-chequeo-correo] whatsapp NO enviado", { tenantId, via: wa.via, modo: wa.modo });
            await registrar(tenantId, destino.telefono, false, `${(wa.error ?? "la API respondió que no").slice(0, 400)}${sufijoDeFallo(wa.via)}`);
          }
        }

        if (!destino.correo) {
          r.sinCorreo += 1;
        } else if (!destino.activo) {
          r.correosOmitidos += 1;
          sinCanal.push("los avisos por correo están apagados");
        } else {
          canalVivo = true;
          const res = await sendReporteDiario(destino.correo, d.correo.asunto, d.correo.html);
          const fallo = res?.error?.message ?? null;
          if (fallo) {
            r.correosFallidos += 1;
            logger.error("[cron/loth-chequeo-correo] correo NO enviado", { tenantId, err: fallo.slice(0, 200) });
          } else {
            llego = true;
            r.correosEnviados += 1;
          }
          await registrarEnvioCorreo(tenantId, "forestal", destino.correo, !fallo, fallo ?? d.correo.asunto);
        }

        if (!canalVivo) {
          r.sinCanal += 1;
          await registrar(
            tenantId,
            "—",
            false,
            sinCanal.length === 0
              ? "El negocio no tiene WhatsApp ni correo cargado (Ajustes → Datos del negocio): el aviso del chequeo quedó en la campana."
              : `Sin canal para avisar (${sinCanal.join("; ")}): el aviso del chequeo quedó en la campana.`,
          );
        }
        // Llegó por WhatsApp o correo, o no hay más canal que la campana: se sella.
        sellar = llego || !canalVivo;
      }

      /* Bajo el candado se vuelve a planear con lo que haya guardado (otra corrida pudo sellar antes).
         Sin sellar igual se guarda lo podado (lo que caducó). */
      const { checks, sinLeer, hoy } = d.chequeo;
      await ForestLothChequeoDB.guardarAvisadosPorCorreo(tenantId, (actual) => {
        const p = planearCorreoChequeo({ checks, sinLeer, registro: actual, hoy });
        const siguiente = sellar ? p.registroSiSale : p.registroSiNoSale;
        return registroCambia(actual, siguiente) ? siguiente : null;
      });
      if (sellar) r.sellados += d.plan.nuevos.length;
    } catch (err) {
      r.fallaron += 1;
      // Un negocio que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/loth-chequeo-correo] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json(r);
});
