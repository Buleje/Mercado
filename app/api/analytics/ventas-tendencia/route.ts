export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

// Feriados peruanos fijos (mes-día)
const FERIADOS_PERU: Record<string, string> = {
  "01-01": "Año Nuevo",
  "05-01": "Día del Trabajo",
  "06-07": "Batalla de Arica",
  "06-29": "San Pedro y San Pablo",
  "07-23": "Día de la Fuerza Aérea",
  "07-28": "Fiestas Patrias",
  "07-29": "Fiestas Patrias",
  "08-06": "Batalla de Junín",
  "08-30": "Santa Rosa de Lima",
  "10-08": "Combate de Angamos",
  "11-01": "Día de Todos los Santos",
  "12-08": "Inmaculada Concepción",
  "12-09": "Batalla de Ayacucho",
  "12-25": "Navidad",
};

/**
 * GET /api/analytics/ventas-tendencia?period=30d
 * Daily sales trend with 7-day moving average, quincena and holiday markers.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({ period: searchParams.get("period") ?? "30d" });
    const period = parsed.success ? parsed.data.period : "30d";

    const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    // Need 7 extra days for moving average calculation
    const totalDays = periodDays + 7;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(todayStart);
    startDate.setDate(startDate.getDate() - totalDays);

    const tenantFilter = { tenantId: auth.tenantId };

    // Get all sales in the extended period
    const sales = await prisma.sale.findMany({
      where: { ...tenantFilter, createdAt: { gte: startDate } },
      select: { total: true, createdAt: true },
    });

    // Group sales by day (YYYY-MM-DD)
    const dailyTotals = new Map<string, number>();
    for (const sale of sales) {
      const dateKey = sale.createdAt.toISOString().slice(0, 10);
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + sale.total);
    }

    // Build array for the full extended period
    type DayData = { fecha: string; total: number };
    const allDays: DayData[] = [];
    for (let i = totalDays; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      allDays.push({ fecha: dateKey, total: Math.round((dailyTotals.get(dateKey) ?? 0) * 100) / 100 });
    }

    // Calculate 7-day moving average and build response (only for the requested period)
    const dias: {
      fecha: string;
      total: number;
      movingAvg7d: number;
      isQuincena: boolean;
      isFeriado: boolean;
      feriadoNombre?: string;
    }[] = [];

    for (let i = 7; i < allDays.length; i++) {
      const day = allDays[i];
      // Moving average: average of previous 7 days (not including today)
      let sum7 = 0;
      for (let j = i - 7; j < i; j++) {
        sum7 += allDays[j].total;
      }
      const movingAvg7d = Math.round((sum7 / 7) * 100) / 100;

      const dateObj = new Date(day.fecha + "T00:00:00");
      const dayOfMonth = dateObj.getDate();
      const isQuincena = dayOfMonth === 1 || dayOfMonth === 15;

      const monthDay = day.fecha.slice(5); // MM-DD
      const isFeriado = monthDay in FERIADOS_PERU;

      dias.push({
        fecha: day.fecha,
        total: day.total,
        movingAvg7d,
        isQuincena,
        isFeriado,
        ...(isFeriado ? { feriadoNombre: FERIADOS_PERU[monthDay] } : {}),
      });
    }

    return NextResponse.json({ dias });
  } catch (e) {
    console.error("[analytics/ventas-tendencia] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
