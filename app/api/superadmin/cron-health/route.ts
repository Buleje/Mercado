import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getCronHealthSummary, formatCronHealthTable } from "@/lib/cron/health-tracker";

const KNOWN_CRONS = [
  "reminders", "trial-expiry", "superadmin-alerts", "agent-tasks",
  "batch-expiry-alerts", "auto-close-register", "daily-summary",
  "stock-alerts-notify", "auto-reorder-check", "expiry-discounts",
  "auto-backup", "fiados-reminder", "first-purchase-coupon",
  "abandoned-cart", "prestamos-mora", "prestamos-recordatorios",
  "settle-commissions", "monthly-report", "cleanup-demos",
  "reorder-reminders", "loyalty-points-reminder", "daily-deal-bundle",
  "category-margins-report", "dead-stock-report", "weekly-report",
  "metering-rollup", "sunat-retry", "midday-push", "churn-score",
  "price-drop-alerts", "credit-weekly-report", "credit-reminders",
  "credit-score-recalc", "marketplace-weekly-report", "zone-offers-push",
  "marketplace-daily-summary", "supplier-scoring", "weekly-email-report",
  "recompra-coupon", "notifications", "marketplace-stockout-predictions",
  "marketplace-sponsored-cleanup", "marketplace-anomaly-detection",
  "marketplace-abandoned-carts", "market-alerts", "isolation-monitor",
  "inactive-customers", "demand-forecast", "credit-overdue",
  "birthday-greetings", "birthday-coupons", "ai-history-cleanup",
];

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE");
  if (rl) return rl;

  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summaries = await getCronHealthSummary();
    const tracked = new Set(summaries.map((s) => s.jobName));
    const neverRun = KNOWN_CRONS.filter((c) => !tracked.has(c));

    const failedLast24h = summaries.filter((s) => s.failureCount24h > 0);
    const stale = summaries.filter((s) => {
      if (!s.lastRun) return true;
      const hoursSinceRun = (Date.now() - s.lastRun.getTime()) / 3600000;
      return hoursSinceRun > 48;
    });

    logger.info("[CronHealth] Dashboard queried", {
      tracked: summaries.length,
      neverRun: neverRun.length,
      failed: failedLast24h.length,
    });

    return NextResponse.json({
      totalKnown: KNOWN_CRONS.length,
      totalTracked: summaries.length,
      neverRun,
      failedLast24h: failedLast24h.map((s) => ({ job: s.jobName, failures: s.failureCount24h, rate: s.successRate24h })),
      staleJobs: stale.map((s) => s.jobName),
      summaries,
      markdown: formatCronHealthTable(summaries),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[CronHealth] Failed to query", { error: String(err) });
    return NextResponse.json({ error: "Failed to query cron health" }, { status: 500 });
  }
}
