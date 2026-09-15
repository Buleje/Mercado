import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { ForestTramitesDB } from "@/lib/db/forest-tramites.db";
import { tramitesPorVencer } from "@/lib/forestal/tramites-registro";
import { mensajeAvisoTramites } from "@/lib/forestal/tramites-aviso-mensaje";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * Aviso automático de trámites que vencen pronto (Trámites y Oficios, ADR-308).
 *
 * El banner "vence pronto" del catálogo y el botón manual "Avisar por
 * WhatsApp" sólo avisan si alguien entra a mirar el panel. Este cron corre
 * una vez al día y manda el MISMO mensaje (`tramites-aviso-mensaje`, single
 * source) sin que nadie tenga que abrir nada.
 *
 * Anti-spam: sella `avisoVencimientoEnviadoEn` por trámite SÓLO si el envío
 * salió bien — si falla (WhatsApp caído, tenant sin teléfono), no sella, y
 * mañana lo vuelve a intentar. Se resetea solo si `fechaLimite` cambia
 * (`construirTramite`): un trámite avisa una vez por vencimiento, no todos
 * los días de la ventana.
 *
 * Cross-tenant vía KV: no hay tabla Prisma que listar `DISTINCT tenantId`
 * (el expediente vive en `PlatformSetting`), así que `listAllTenants()` lee
 * por prefijo de clave — mismo patrón que el resto de los crons del módulo.
 */
export const GET = withCronAuth("tramites-vencimiento", async () => {
  const hoy = new Date();
  const porTenant = await ForestTramitesDB.listAllTenants();

  let tenantsConAviso = 0;
  let whatsappEnviados = 0;
  let whatsappFallidos = 0;
  let sinTelefono = 0;

  for (const { tenantId, tramites } of porTenant) {
    const porVencer = tramitesPorVencer(tramites, hoy).filter((t) => !t.avisoVencimientoEnviadoEn);
    if (porVencer.length === 0) continue;
    tenantsConAviso += 1;

    try {
      // `tenantId` en el forestal viene mixto (cuid o slug) — mismo gotcha
      // que `forestal-plazos`.
      const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ id: tenantId }, { slug: tenantId }] },
        select: { ownerPhone: true },
      });
      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (!phone || phone.length < 9) {
        sinTelefono += 1;
        logger.warn("[cron/tramites-vencimiento] tenant sin ownerPhone", { tenantId, n: porVencer.length });
        continue;
      }

      const mensaje = mensajeAvisoTramites(porVencer);
      const ok = await sendWhatsAppText(phone, mensaje).catch((err) => {
        logger.error("[cron/tramites-vencimiento] whatsapp falló", { tenantId, err: String(err).slice(0, 200) });
        return false;
      });
      if (ok) {
        whatsappEnviados += 1;
        await ForestTramitesDB.marcarAvisoVencimientoEnviado(
          tenantId,
          porVencer.map((t) => t.id),
        );
      } else {
        whatsappFallidos += 1;
        logger.error("[cron/tramites-vencimiento] whatsapp NO enviado", { tenantId, n: porVencer.length });
      }
    } catch (err) {
      // Un tenant que falla no puede dejar sin aviso a los demás.
      logger.error("[cron/tramites-vencimiento] tenant failed", { tenantId, err: String(err).slice(0, 300) });
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
