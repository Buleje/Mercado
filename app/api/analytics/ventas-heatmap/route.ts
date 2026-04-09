import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";

const querySchema = z.object({
  days: z.coerce.number().min(7).max(180).default(60),
});

const DOW_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * GET /api/analytics/ventas-heatmap?days=60
 * Sales heatmap grouped by day-of-week and hour.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({ days: searchParams.get("days") ?? 60 });
    const days = parsed.success ? parsed.data.days : 60;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    const tenantFilter = { tenantId: auth.tenantId };

    const sales = await prisma.sale.findMany({
      where: { ...tenantFilter, createdAt: { gte: startDate } },
      select: { total: true, createdAt: true },
    });

    // Accumulate: matrix[dow][hour] = { totalSum, count, daysSet }
    type CellData = { totalSum: number; count: number; daysSet: Set<string> };
    const matrix: Record<number, Record<number, CellData>> = {};
    for (let dow = 0; dow < 7; dow++) {
      matrix[dow] = {};
      for (let hour = 0; hour < 24; hour++) {
        matrix[dow][hour] = { totalSum: 0, count: 0, daysSet: new Set() };
      }
    }

    for (const sale of sales) {
      const dow = sale.createdAt.getDay();
      const hour = sale.createdAt.getHours();
      const dayKey = sale.createdAt.toISOString().slice(0, 10);
      // TD-018: sale.total es Decimal
      matrix[dow][hour].totalSum += toNumOrZero(sale.total);
      matrix[dow][hour].count += 1;
      matrix[dow][hour].daysSet.add(dayKey);
    }

    // Build response matrix with averages
    const responseMatrix: Record<number, Record<number, { avgTotal: number; count: number }>> = {};
    let peakSlot = { dow: 0, hour: 0, avgTotal: 0 };

    for (let dow = 0; dow < 7; dow++) {
      responseMatrix[dow] = {};
      for (let hour = 0; hour < 24; hour++) {
        const cell = matrix[dow][hour];
        // Count how many of this DOW existed in the period
        const weeksInPeriod = Math.ceil(days / 7);
        const divisor = Math.max(weeksInPeriod, 1);
        const avgTotal = Math.round((cell.totalSum / divisor) * 100) / 100;

        responseMatrix[dow][hour] = { avgTotal, count: cell.count };

        if (avgTotal > peakSlot.avgTotal) {
          peakSlot = { dow, hour, avgTotal };
        }
      }
    }

    const insight = sales.length > 0
      ? `Tu hora pico es los ${DOW_NAMES[peakSlot.dow]} a las ${peakSlot.hour}:00 con promedio S/ ${peakSlot.avgTotal.toFixed(2)}`
      : "Sin datos suficientes para determinar hora pico";

    return NextResponse.json({
      matrix: responseMatrix,
      peakSlot,
      insight,
    });
  } catch (e) {
    console.error("[analytics/ventas-heatmap] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
