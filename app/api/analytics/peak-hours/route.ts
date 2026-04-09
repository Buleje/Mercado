import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/analytics/peak-hours — sales grouped by hour of day and day of week
// Query params: days (default 30), from, to (legacy support)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const daysParam = searchParams.get("days");

    // Build date filter — prefer days param, fallback to from/to
    let createdAtClause: Record<string, Date> | undefined;

    if (daysParam) {
      const days = Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      createdAtClause = { gte: cutoff };
    } else if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      createdAtClause = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
    } else {
      // Default: last 30 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      createdAtClause = { gte: cutoff };
    }

    // Fetch sales within range
    const sales = await prisma.sale.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(createdAtClause && { createdAt: createdAtClause }),
      },
      select: { total: true, createdAt: true },
    });

    // Aggregate by hour (0-23)
    const byHour: { hour: number; count: number; total: number; avgTotal: number; isPeak: boolean; isValley: boolean }[] = Array.from(
      { length: 24 },
      (_, i) => ({ hour: i, count: 0, total: 0, avgTotal: 0, isPeak: false, isValley: false }),
    );

    // Aggregate by day of week (0=Sunday, 6=Saturday)
    const byDayOfWeek: { day: number; count: number; total: number }[] = Array.from(
      { length: 7 },
      (_, i) => ({ day: i, count: 0, total: 0 }),
    );

    for (const sale of sales) {
      const d = new Date(sale.createdAt);
      const hour = d.getHours();
      const dow = d.getDay();

      byHour[hour].count++;
      byHour[hour].total = Math.round((byHour[hour].total + sale.total) * 100) / 100;

      byDayOfWeek[dow].count++;
      byDayOfWeek[dow].total = Math.round((byDayOfWeek[dow].total + sale.total) * 100) / 100;
    }

    // Calculate avgTotal per hour
    for (const h of byHour) {
      h.avgTotal = h.count > 0 ? Math.round((h.total / h.count) * 100) / 100 : 0;
    }

    // Determine top 3 peaks and bottom 3 valleys by count (only hours with activity)
    const activeHours = byHour
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count);

    const peakHours = new Set(activeHours.slice(0, 3).map((h) => h.hour));
    const valleyHours = new Set(
      activeHours.length > 3
        ? activeHours.slice(-3).map((h) => h.hour)
        : []
    );

    for (const h of byHour) {
      h.isPeak = peakHours.has(h.hour);
      h.isValley = valleyHours.has(h.hour);
    }

    return NextResponse.json({ byHour, byDayOfWeek });
  } catch (e) {
    logger.error("[analytics/peak-hours] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
