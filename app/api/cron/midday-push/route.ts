import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { broadcastPush } from "@/lib/push-sender";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/cron/midday-push
 *
 * Cron job scheduled at noon Lima time (17:00 UTC).
 * For each active tenant: calculates today's sales total so far
 * and sends a push notification comparing vs yesterday.
 *
 * Suggested vercel.json schedule: "0 17 * * *" (12:00 Lima = UTC-5)
 * Auth: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("midday-push", async () => {
      const now = new Date();

      // Today's start (Lima timezone UTC-5)
      const todayStart = new Date(now);
      todayStart.setUTCHours(5, 0, 0, 0); // 00:00 Lima = 05:00 UTC
      if (todayStart > now) {
        // If we haven't reached midnight Lima yet, go back a day
        todayStart.setDate(todayStart.getDate() - 1);
      }

      // Yesterday's start
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      // Get all active tenants
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      const notifications: { tenant: string; todayTotal: number; yesterdayTotal: number }[] = [];

      for (const tenant of tenants) {
        // Today's orders
        const todayOrders = await prisma.order.findMany({
          where: {
            tenantId: tenant.id,
            deletedAt: null,
            createdAt: { gte: todayStart, lte: now },
            status: { notIn: ["cancelado"] },
          },
          select: { total: true },
        });

        const todayTotal = todayOrders.reduce(
          (sum, o) => sum + toNumOrZero(o.total),
          0,
        );

        // Yesterday's orders (same time window)
        const yesterdayEndTime = new Date(yesterdayStart);
        yesterdayEndTime.setHours(
          yesterdayEndTime.getHours() + (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60),
        );

        const yesterdayOrders = await prisma.order.findMany({
          where: {
            tenantId: tenant.id,
            deletedAt: null,
            createdAt: { gte: yesterdayStart, lte: yesterdayEndTime },
            status: { notIn: ["cancelado"] },
          },
          select: { total: true },
        });

        const yesterdayTotal = yesterdayOrders.reduce(
          (sum, o) => sum + toNumOrZero(o.total),
          0,
        );

        // Build comparison text
        let comparison: string;
        if (yesterdayTotal === 0) {
          comparison = todayTotal > 0 ? "Ayer no hubo ventas a esta hora" : "Sin ventas aún";
        } else {
          const pctChange = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
          const sign = pctChange >= 0 ? "+" : "";
          comparison = `${sign}${Math.round(pctChange)}% vs ayer`;
        }

        const formattedTotal = todayTotal.toFixed(2);
        const title = `Llevas S/${formattedTotal} hoy`;
        const body = comparison;

        // Fire-and-forget: send push to all subscriptions of this tenant
        broadcastPush({
          title,
          body,
          url: "/admin",
          icon: "/icons/icon-192x192.png",
        }).catch((err) => logger.error("[cron/midday-push] broadcast push failed", { error: String(err), tenant: tenant.slug }));

        // Fire-and-forget: log the activity
        logActivity(
          "midday-push-sent",
          "Notification",
          `Push mediodía: S/${formattedTotal} (${comparison}). Tenant: ${tenant.slug}`,
          undefined,
          "cron",
          undefined,
          tenant.id,
        ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

        notifications.push({
          tenant: tenant.slug,
          todayTotal: Math.round(todayTotal * 100) / 100,
          yesterdayTotal: Math.round(yesterdayTotal * 100) / 100,
        });
      }

      logger.info("[cron/midday-push] Sent notifications", {
        count: notifications.length,
      });

      return {
        ok: true,
        sent: notifications.length,
        notifications,
        sentAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/midday-push] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
