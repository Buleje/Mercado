import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { BatchesDB, NotificationLogsDB } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/batch-expiry-alerts
 *
 * Cron job diario (08:00) que revisa lotes por vencer en 3 días.
 * Para cada tenant con lotes próximos a vencer crea un registro
 * de notificación en NotificationLog — sin envío push real.
 *
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("batch-expiry-alerts", async () => {
      // Obtener todos los tenants activos
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true },
      });

      let totalNotifications = 0;
      const tenantsAlerted: string[] = [];

      for (const tenant of tenants) {
        const expiringBatches = await BatchesDB.getExpiring(tenant.id, 3);
        if (expiringBatches.length === 0) continue;

        // Agrupar por producto para consolidar la notificación
        const productNames = [
          ...new Set(expiringBatches.map((b) => b.productName)),
        ].slice(0, 5);

        const message =
          expiringBatches.length === 1
            ? `Lote "${expiringBatches[0].lote}" del producto "${expiringBatches[0].productName}" vence en 3 días (${expiringBatches[0].quantity} ${expiringBatches[0].unit}).`
            : `${expiringBatches.length} lotes por vencer en 3 días: ${productNames.join(", ")}${productNames.length < expiringBatches.length ? " y más" : ""}.`;

        await NotificationLogsDB.add({
          type: "batch_expiry_alert",
          recipient: tenant.id,
          message,
          status: "pending",
        });

        totalNotifications++;
        tenantsAlerted.push(tenant.slug);

        logger.info("[cron/batch-expiry-alerts] Lotes por vencer", { tenant: tenant.slug, count: expiringBatches.length });
      }

      return {
        ok: true,
        tenantsChecked: tenants.length,
        tenantsAlerted: tenantsAlerted.length,
        totalNotifications,
        slugs: tenantsAlerted,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/batch-expiry-alerts] Fatal error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
