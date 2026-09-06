import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { ForestTramitesDB } from "@/lib/db/forest-tramites.db";
import { tramitesSinRespuesta } from "@/lib/forestal/tramites-registro";
import { mensajeAvisoSinRespuesta } from "@/lib/forestal/tramites-aviso-mensaje";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * Aviso automático de trámites presentados que llevan mucho sin respuesta de
 * la autoridad (Trámites y Oficios, ADR-308 — ronda 2 pendiente de
 * `forestal-tramites-modulo-2026-07-29`).
 *
 * El banner "N días sin respuesta" de `TramitesExpediente` sólo avisa si
 * alguien entra a mirar el panel. Este cron corre una vez al día y manda el
 * MISMO mensaje (`tramites-aviso-mensaje`, single source) sin que nadie
 * tenga que abrir nada — mismo patrón que `tramites-vencimiento`, pero
 * mirando hacia ATRÁS desde `fechaPresentacion` (`tramitesSinRespuesta`) en
 * vez de hacia adelante desde `fechaLimite`.
 *
 * Anti-spam: sella `avisoSinRespuestaEnviadoEn` por trámite SÓLO si el envío
 * salió bien; se resetea solo si `fechaPresentacion` cambia
 * (`construirTramite`) — un trámite avisa una vez por espera, no todos los
 * días que sigue sin respuesta.
 */
export const GET = withCronAuth("tramites-sin-respuesta", async () => {
  const hoy = new Date();
  const porTenant = await ForestTramitesDB.listAllTenants();

  let tenantsConAviso = 0;
  let whatsappEnviados = 0;
  let whatsappFallidos = 0;
  let sinTelefono = 0;

  for (const { tenantId, tramites } of porTenant) {
    const sinRespuesta = tramitesSinRespuesta(tramites, hoy).filter((t) => !t.avisoSinRespuestaEnviadoEn);
    if (sinRespuesta.length === 0) continue;
    tenantsConAviso += 1;

    try {
      // `tenantId` en el forestal viene mixto (cuid o slug) — mismo gotcha
      // que `tramites-vencimiento`/`forestal-plazos`.
      const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ id: tenantId }, { slug: tenantId }] },
        select: { ownerPhone: true },
      });
      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (!phone || phone.length < 9) {
        sinTelefono += 1;
        logger.warn("[cron/tramites-sin-respuesta] tenant sin ownerPhone", { tenantId, n: sinRespuesta.length });
        continue;
      }

      const mensaje = mensajeAvisoSinRespuesta(sinRespuesta, hoy);
      const ok = await sendWhatsAppText(phone, mensaje).catch((err) => {
        logger.error("[cron/tramites-sin-respuesta] whatsapp falló", { tenantId, err: String(err).slice(0, 200) });
        return false;
      });
      if (ok) {
        whatsappEnviados += 1;
        await ForestTramitesDB.marcarAvisoSinRespuestaEnviado(
          tenantId,
          sinRespuesta.map((t) => t.id),
        );
      } else {
        whatsappFallidos += 1;
        logger.error("[cron/tramites-sin-respuesta] whatsapp NO enviado", { tenantId, n: sinRespuesta.length });
      }
    } catch (err) {
      // Un tenant que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/tramites-sin-respuesta] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsConAviso,
    whatsappEnviados,
    whatsappFallidos,
    sinTelefono,
  });
});
