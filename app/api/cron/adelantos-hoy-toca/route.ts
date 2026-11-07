import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { AdelantosHoyTocaDB } from "@/lib/db/adelantos-hoy-toca.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { describirEnvioWhatsApp, sufijoDeFallo } from "@/lib/whatsapp/aviso-plantilla";
import { sendReporteDiario } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/email/escape-html";
import { avisoCorreoActivo, registrarEnvioCorreo } from "@/lib/avisos-correo";
import { avisoSemanal, DESTINOS_HOY_TOCA, lunesDeLaSemana, type AvisoSemanal } from "@/lib/adelantos/hoy-toca";
import { logger } from "@/lib/logger";

/**
 * El aviso de los lunes al dueño (25-10): el mismo «Hoy toca» del Resumen de
 * Adelantos —cobrar lo quieto o vencido, poner fecha, firmar, anotar el
 * celular— con el enlace a cada cosa. Corre los lunes 07:00 de Lima
 * (`vercel.json`, 12:00 UTC). Negocio por negocio, cada uno con su `tenantId`:
 * la lista de negocios es lo único que cruza (`tenantsConAbiertos`).
 *
 * Canales, como `loth-plan-vencimiento`: campana del panel, WhatsApp del
 * negocio al celular del dueño y correo del dueño (interruptor «reportes»).
 * La campana lleva sólo el titular con cantidades («cobrar a 2 personas, 3 sin
 * fecha»): la campana la ve también el cajero, y los nombres y montos quedan
 * detrás del enlace, que pide permiso de Adelantos. Los nombres y montos van
 * sólo por WhatsApp y correo, que son del dueño.
 *
 * Una vez por semana y negocio: la semana (su lunes de Lima) se SELLA en
 * `PlatformSettings` si el aviso llegó por WhatsApp o correo, o si el negocio no
 * tiene ningún canal vivo (sólo queda la campana). Si un canal vivo falló, no se
 * sella y otra corrida de la misma semana lo reintenta; la campana se reusa
 * mientras siga sin leer.
 *
 * `?ensayo=1`: devuelve lo que mandaría, sin mandar ni sellar nada. En el panel,
 * «⋯ › Ver el aviso de esta semana» del Resumen muestra el mismo texto.
 */

const URL_PANEL = "https://buleje.pe";
const TIPO_CAMPANA = "ADELANTOS_SEMANA";
const DEDUP_CAMPANA_HORAS = 24 * 7;

interface SelloSemana {
  semana: string;
}

const claveSello = (tenantId: string) => `adelantos-hoy-toca:${tenantId}`;

async function registrar(tenantId: string, destino: string, ok: boolean, detalle: string) {
  await NotificationLogsDB.add(
    { type: "adelantos_hoy_toca_whatsapp", recipient: destino, status: ok ? "sent" : "failed", message: detalle.slice(0, 500) },
    tenantId,
  ).catch((err) =>
    logger.error("[cron/adelantos-hoy-toca] no se pudo registrar el envío", { tenantId, error: String(err).slice(0, 200) }),
  );
}

function htmlDelCorreo(aviso: AvisoSemanal, negocio: string | null): string {
  const filas = aviso.tareas
    .map(
      (t) =>
        `<li style="margin:8px 0"><b>${escapeHtml(t.titulo)}</b><br>${escapeHtml(t.detalle)}<br><a href="${URL_PANEL}${escapeHtml(t.href)}">${escapeHtml(t.boton)}</a></li>`,
    )
    .join("");
  const resto = aviso.resto > 0 ? `<p>Y ${aviso.resto} más en el Resumen.</p>` : "";
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
  <p>${escapeHtml(negocio ?? "Tu negocio")} · Adelantos</p>
  <p><b>${escapeHtml(aviso.titulo)}</b></p>
  <ul>${filas}</ul>
  ${resto}
  <p><a href="${URL_PANEL}${DESTINOS_HOY_TOCA.resumen}">Ver el Resumen de adelantos</a></p>
</div>`;
}

export const GET = withCronAuth("adelantos-hoy-toca", async (req) => {
  const ensayo = new URL(req.url).searchParams.get("ensayo") === "1";
  const ahora = new Date();
  const semana = lunesDeLaSemana(ahora);
  const r = {
    ensayo,
    semana,
    revisados: 0,
    conTareas: 0,
    yaAvisados: 0,
    notificaciones: 0,
    whatsappEnviados: 0,
    whatsappFallidos: 0,
    whatsappSinConfigurar: 0,
    correosEnviados: 0,
    correosFallidos: 0,
    correosOmitidos: 0,
    sinCanal: 0,
    sellados: 0,
    plan: [] as { tenantId: string; negocio: string | null; titulo: string; texto: string }[],
  };

  const activos = new Set(await TenantsDB.listActiveIds());
  const tenants = (await AdelantosHoyTocaDB.tenantsConAbiertos()).filter((id) => activos.has(id));

  for (const tenantId of tenants) {
    r.revisados += 1;
    try {
      const clave = claveSello(tenantId);
      const [tareas, sello, tenant] = await Promise.all([
        /* Sólo las tareas: el aviso no lleva las cifras ni necesita la cuenta de madera. */
        AdelantosHoyTocaDB.tareas(tenantId, ahora),
        PlatformSettingsDB.getFresco<SelloSemana>(clave),
        TenantsDB.contactoDelDueno(tenantId),
      ]);
      if (tareas.length === 0) continue;
      r.conTareas += 1;
      if (sello?.semana === semana) {
        r.yaAvisados += 1;
        continue;
      }
      const negocio = tenant?.name ?? null;
      const aviso = avisoSemanal(tareas, { negocio, base: URL_PANEL });
      if (ensayo) {
        r.plan.push({ tenantId, negocio, titulo: aviso.titulo, texto: aviso.texto });
        continue;
      }

      const n = await NotificationCenterDB.createOrReuse({
        tenantId,
        type: TIPO_CAMPANA,
        entityId: `adelantos-hoy-toca-${semana}`,
        severity: "MEDIUM",
        title: aviso.titulo,
        body: "Ábrelo para ver a quién cobrar y cuánto.",
        actionUrl: DESTINOS_HOY_TOCA.resumen,
        actionLabel: "Ver qué toca",
        dedupWindowHours: DEDUP_CAMPANA_HORAS,
      });
      if (n.created) r.notificaciones += 1;

      let llego = false;
      /* Vivo = un canal que, si falló hoy, puede andar en el reintento. */
      let canalVivo = false;
      const sinCanal: string[] = [];

      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (phone && phone.length >= 9) {
        const wa = await enviarWhatsAppDelNegocio(tenant?.id ?? tenantId, phone, aviso.texto, { contexto: "adelantos_hoy_toca" });
        if (wa.ok) {
          llego = true;
          canalVivo = true;
          r.whatsappEnviados += 1;
          await registrar(tenantId, phone, true, `${aviso.titulo} · ${describirEnvioWhatsApp(wa)}`);
        } else if (wa.via == null) {
          r.whatsappSinConfigurar += 1;
          sinCanal.push("el WhatsApp del negocio no está configurado");
        } else {
          canalVivo = true;
          r.whatsappFallidos += 1;
          logger.error("[cron/adelantos-hoy-toca] whatsapp NO enviado", { tenantId, via: wa.via, modo: wa.modo });
          await registrar(tenantId, phone, false, `${(wa.error ?? "la API respondió que no").slice(0, 400)}${sufijoDeFallo(wa.via)}`);
        }
      }

      const correo = tenant?.ownerEmail?.trim();
      if (correo && tenant) {
        if (!(await avisoCorreoActivo(tenant.id, "reportes"))) {
          r.correosOmitidos += 1;
          sinCanal.push("los avisos por correo están apagados");
        } else {
          canalVivo = true;
          const res = await sendReporteDiario(correo, aviso.titulo, htmlDelCorreo(aviso, negocio));
          const motivo = res?.error?.message ?? null;
          if (motivo) {
            r.correosFallidos += 1;
            logger.error("[cron/adelantos-hoy-toca] correo NO enviado", { tenantId, error: motivo.slice(0, 200) });
          } else {
            llego = true;
            r.correosEnviados += 1;
          }
          await registrarEnvioCorreo(tenant.id, "reportes", correo, !motivo, motivo ?? aviso.titulo);
        }
      }

      if (!canalVivo) {
        r.sinCanal += 1;
        await registrar(
          tenantId,
          "—",
          false,
          sinCanal.length === 0
            ? "El negocio no tiene WhatsApp ni correo del dueño (Ajustes → Datos del negocio): el aviso quedó en la campana."
            : `Sin canal para avisar (${sinCanal.join("; ")}): el aviso quedó en la campana.`,
        );
      }

      if (llego || !canalVivo) {
        await PlatformSettingsDB.actualizar<SelloSemana, null>(clave, () => ({ valor: { semana }, resultado: null }));
        r.sellados += 1;
      }
    } catch (err) {
      // Un negocio que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/adelantos-hoy-toca] tenant falló", { tenantId, error: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json(r);
});
