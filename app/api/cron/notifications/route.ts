import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { generateNotifications } from "@/lib/notification-generators";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/notifications
 *
 * Genera notificaciones automáticas del Notification Center:
 * fiados vencidos, stock crítico, turnos sin cerrar, proveedores vencidos.
 *
 * Sugerencia vercel.json: cada 30 minutos
 * Autorización: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("notification-center", async () => {
      const generated = await generateNotifications("main");

      logger.info("[cron/notifications] Notificaciones generadas", { generated });

      logActivity(
        "notification-gen",
        "Notification",
        `${generated} notificación(es) generadas por cron`,
        undefined,
        "cron"
      ).catch((err) => logger.warn("[cron] activity log failed", { error: String(err) }));

      return {
        ok: true,
        generated,
        processedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/notifications] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
