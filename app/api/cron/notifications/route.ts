import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { withCronRetry } from "@/lib/cron-retry";
import { generateNotifications, type ResultadoAvisos } from "@/lib/notification-generators";
import { TenantsDB } from "@/lib/db/tenants.db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/notifications
 *
 * Arma los avisos de la campana (fiado vencido, stock bajo, turno sin cerrar,
 * caja descuadrada, cuota próxima…) en CADA negocio activo. Antes tenía el
 * negocio «main» fijo en el código (INTEG-01, 09-10).
 *
 * `?tenant=<slug o id>` corre uno solo: para probar en local sin escribir en
 * los demás. Sin horario en vercel.json todavía: agendarlo es decisión de
 * Brandon (es un deploy). Autorización: Bearer CRON_SECRET.
 *
 * Ojo al agendarlo: recorre los negocios EN SERIE (~12 consultas cada uno) y
 * app/api/** corta a los 30 s en vercel.json. Con muchos negocios, darle su
 * propio `maxDuration` ahí o repartirlo en tandas por `?tenant=`.
 */
export const GET = withCronAuth("notifications", async (req) => {
  const solo = req.nextUrl.searchParams.get("tenant")?.trim() || null;

  try {
    const activos = await TenantsDB.listActive();
    const tenants = solo ? activos.filter((t) => t.slug === solo || t.id === solo) : activos;
    if (solo && tenants.length === 0) {
      return NextResponse.json({ ok: false, error: "Negocio no encontrado o inactivo" }, { status: 404 });
    }

    const result = await withCronRetry(
      "notification-center",
      async () => {
        const porNegocio: Array<{ tenant: string } & ResultadoAvisos> = [];
        let nuevos = 0;
        for (const t of tenants) {
          try {
            const r = await generateNotifications(t.id, { nombreNegocio: t.name });
            nuevos += r.nuevos;
            porNegocio.push({ tenant: t.slug, ...r });
          } catch (err) {
            logger.error("[cron/notifications] falló un negocio", { tenantId: t.id, error: String(err) });
            porNegocio.push({ tenant: t.slug, nuevos: 0, porTipo: {}, fallos: ["todo"] });
          }
        }

        logger.info("[cron/notifications] avisos de la campana", { negocios: tenants.length, nuevos });
        logActivity(
          "notification-gen",
          "Notification",
          `${nuevos} aviso(s) nuevos en ${tenants.length} negocio(s)`,
          undefined,
          "cron",
        ).catch((err) => logger.warn("[cron/notifications] activity log failed", { error: String(err) }));

        return { ok: true, negocios: tenants.length, nuevos, porNegocio, processedAt: new Date().toISOString() };
      },
      // Cada negocio ya atrapa su error: reintentar todo sólo repetiría el recorrido.
      { maxRetries: 1 },
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/notifications] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
