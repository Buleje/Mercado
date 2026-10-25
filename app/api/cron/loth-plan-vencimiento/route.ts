import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { describirEnvioWhatsApp, sufijoDeFallo } from "@/lib/whatsapp/aviso-plantilla";
import { sendReporteDiario } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/email/escape-html";
import { avisoCorreoActivo, registrarEnvioCorreo } from "@/lib/avisos-correo";
import { planFichaDesdeApi, type PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { ACCION_PLAN } from "@/lib/forestal/loth-aviso-plazos";
import {
  asuntoCorreoVencimiento,
  claveAvisoVigencia,
  mensajeWhatsAppVencimiento,
  planearAvisosVencimiento,
  sellarAvisos,
  type AvisoVencimientoPlan,
  type RegistroAvisosVigencia,
} from "@/lib/forestal/loth-plan-aviso-vencimiento";
import { logger } from "@/lib/logger";

/**
 * Aviso antes de que venza el plan de manejo del Libro TH: 90, 30 y 7 días
 * antes y el mismo día, UNA vez por plan y escalón (qué se avisa y por qué:
 * `loth-plan-aviso-vencimiento`). Corre 07:22 de Lima (`vercel.json`), dos minutos después de `forestal-plazos`.
 *
 * Canales: los mismos que `forestal-plazos` — campana del panel (una por plan,
 * con «Abrir el plan»), WhatsApp del negocio y correo del dueño (respeta el
 * interruptor «forestal» del superadmin). Cada envío queda registrado, salga o
 * no.
 *
 * El escalón se SELLA (`PlatformSettings`, una clave por negocio) sólo si el
 * aviso llegó por algún lado: un WhatsApp o un correo que salió, o —si el
 * negocio no tiene ningún canal VIVO— la campana. Canal vivo = un WhatsApp
 * configurado o un correo con el interruptor «forestal» prendido; un WhatsApp
 * «no configurado» (`via: null`) o el correo apagado no se arreglan solos de
 * un día para otro, y sin sellar repetirían la campana y el registro cada
 * mañana (M1, 25-10). Si un canal vivo falló (token vencido, Resend caído),
 * no se sella y se reintenta mañana; la campana de ese escalón se reusa
 * mientras siga sin leer (`DEDUP_CAMPANA_HORAS`).
 *
 * `?ensayo=1`: devuelve lo que mandaría, sin mandar ni sellar nada.
 */

const URL_PANEL = "https://buleje.pe";
/** Una campana por plan y escalón mientras siga sin leer: el reintento de mañana no la repite. */
const DEDUP_CAMPANA_HORAS = 24 * 30;

async function registrar(tenantId: string, destino: string, ok: boolean, detalle: string) {
  await NotificationLogsDB.add(
    { type: "loth_plan_vencimiento_whatsapp", recipient: destino, status: ok ? "sent" : "failed", message: detalle.slice(0, 500) },
    tenantId,
  ).catch((err) =>
    logger.error("[cron/loth-plan-vencimiento] no se pudo registrar el envío", { tenantId, err: String(err).slice(0, 200) }),
  );
}

function htmlDelCorreo(avisos: readonly AvisoVencimientoPlan[], negocio: string | null): string {
  const filas = avisos
    .map((a) => `<li style="margin:6px 0">${escapeHtml(a.texto)}</li>`)
    .join("");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
  <p>${escapeHtml(negocio ?? "Tu negocio")} · Libro TH</p>
  <ul>${filas}</ul>
  <p>Renueva a tiempo: con el plan vencido, la tala y la GTF quedan fuera de la ley.</p>
  <p><a href="${URL_PANEL}${ACCION_PLAN.url}">${escapeHtml(ACCION_PLAN.label)}</a></p>
</div>`;
}

/** Los planes del negocio como los lee la ficha del permiso (fechas en texto, igual que la API). */
async function planesDe(tenantId: string): Promise<PlanFichaApi[]> {
  const filas = JSON.parse(JSON.stringify(await ForestPlanDB.listPlans(tenantId))) as unknown[];
  return filas.flatMap((raw) => {
    const p = planFichaDesdeApi(raw);
    return p ? [p] : [];
  });
}

export const GET = withCronAuth("loth-plan-vencimiento", async (req) => {
  const ensayo = new URL(req.url).searchParams.get("ensayo") === "1";
  const ahora = new Date();
  const r = {
    ensayo,
    revisados: 0,
    conAviso: 0,
    avisos: 0,
    notificaciones: 0,
    whatsappEnviados: 0,
    whatsappFallidos: 0,
    correosEnviados: 0,
    correosFallidos: 0,
    correosOmitidos: 0,
    whatsappSinConfigurar: 0,
    sinCanal: 0,
    sellados: 0,
    plan: [] as { tenantId: string; planId: string; umbral: string; texto: string }[],
  };

  for (const tenantId of await ForestLothDB.tenantsConLibroTh()) {
    r.revisados += 1;
    try {
      const clave = claveAvisoVigencia(tenantId);
      const [planes, registro, tenant] = await Promise.all([
        planesDe(tenantId),
        PlatformSettingsDB.getFresco<RegistroAvisosVigencia>(clave),
        TenantsDB.contactoDelDueno(tenantId),
      ]);
      const avisos = planearAvisosVencimiento(planes, registro, ahora);
      if (avisos.length === 0) continue;
      r.conAviso += 1;
      r.avisos += avisos.length;
      if (ensayo) {
        r.plan.push(...avisos.map((a) => ({ tenantId, planId: a.planId, umbral: String(a.umbral), texto: a.texto })));
        continue;
      }

      for (const a of avisos) {
        const n = await NotificationCenterDB.createOrReuse({
          tenantId,
          // El mismo tipo que el aviso de plazos del libro: cae en «Campo» con su ícono; el entityId lo separa.
          type: "LOTH_PLAZO_SERFOR",
          entityId: `loth-plan-vigencia-${a.planId}-${a.umbral}`,
          severity: a.severidad,
          title: a.texto,
          body: "Renueva a tiempo: con el plan vencido, la tala y la GTF quedan fuera de la ley.",
          actionUrl: ACCION_PLAN.url,
          actionLabel: ACCION_PLAN.label,
          dedupWindowHours: DEDUP_CAMPANA_HORAS,
        });
        if (n.created) r.notificaciones += 1;
      }

      let llego = false;
      /* Vivo = un canal que, si falló hoy, puede andar mañana (ver cabecera). */
      let canalVivo = false;
      const sinCanal: string[] = [];

      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (phone && phone.length >= 9) {
        const wa = await enviarWhatsAppDelNegocio(tenant?.id ?? tenantId, phone, mensajeWhatsAppVencimiento(avisos, tenant?.name), {
          contexto: "loth_plan_vencimiento",
        });
        if (wa.ok) {
          llego = true;
          canalVivo = true;
          r.whatsappEnviados += 1;
          await registrar(tenantId, phone, true, `${avisos[0]?.texto ?? ""} · ${describirEnvioWhatsApp(wa)}`);
        } else if (wa.via == null) {
          r.whatsappSinConfigurar += 1;
          sinCanal.push("el WhatsApp del negocio no está configurado");
        } else {
          canalVivo = true;
          r.whatsappFallidos += 1;
          logger.error("[cron/loth-plan-vencimiento] whatsapp NO enviado", { tenantId, via: wa.via, modo: wa.modo });
          await registrar(tenantId, phone, false, `${(wa.error ?? "la API respondió que no").slice(0, 400)}${sufijoDeFallo(wa.via)}`);
        }
      }

      const correo = tenant?.ownerEmail?.trim();
      if (correo && tenant) {
        if (!(await avisoCorreoActivo(tenant.id, "forestal"))) {
          r.correosOmitidos += 1;
          sinCanal.push("los avisos por correo están apagados");
        } else {
          canalVivo = true;
          const res = await sendReporteDiario(correo, asuntoCorreoVencimiento(avisos), htmlDelCorreo(avisos, tenant.name));
          const motivo = res?.error?.message ?? null;
          if (motivo) {
            r.correosFallidos += 1;
            logger.error("[cron/loth-plan-vencimiento] correo NO enviado", { tenantId, err: motivo.slice(0, 200) });
          } else {
            llego = true;
            r.correosEnviados += 1;
          }
          await registrarEnvioCorreo(tenant.id, "forestal", correo, !motivo, motivo ?? asuntoCorreoVencimiento(avisos));
        }
      }

      if (!canalVivo) {
        r.sinCanal += 1;
        await registrar(
          tenantId,
          "—",
          false,
          sinCanal.length === 0
            ? "El negocio no tiene WhatsApp ni correo cargado (Ajustes → Datos del negocio): el aviso quedó en la campana."
            : `Sin canal para avisar (${sinCanal.join("; ")}): el aviso quedó en la campana.`,
        );
      }

      // Llegó por WhatsApp o correo, o no hay más canal que la campana: se sella.
      if (llego || !canalVivo) {
        await PlatformSettingsDB.actualizar<RegistroAvisosVigencia, null>(clave, (actual) => ({
          valor: sellarAvisos(actual, avisos, planes.map((p) => p.id)),
          resultado: null,
        }));
        r.sellados += avisos.length;
      }
    } catch (err) {
      // Un negocio que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/loth-plan-vencimiento] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json(r);
});
