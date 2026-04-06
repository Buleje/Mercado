export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export type HeatCell = { hour: number; day: string; value: number; amount: number };

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const period = req.nextUrl.searchParams.get("period") ?? "7d";
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const sales = await prisma.sale.findMany({
      where: { tenantId: auth.tenantId, createdAt: { gte: since } },
      select: { createdAt: true, total: true },
    });

    // Agrupar por hora y día de la semana
    const map = new Map<string, { count: number; amount: number }>();

    for (const sale of sales) {
      const d = new Date(sale.createdAt);
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0=Lun..6=Dom
      const day = DAYS[dayIndex];
      const hour = d.getHours();
      const key = `${day}::${hour}`;
      const prev = map.get(key) ?? { count: 0, amount: 0 };
      map.set(key, { count: prev.count + 1, amount: prev.amount + (sale.total ?? 0) });
    }

    const cells: HeatCell[] = [];
    for (const day of DAYS) {
      for (let hour = 0; hour < 24; hour++) {
        const entry = map.get(`${day}::${hour}`) ?? { count: 0, amount: 0 };
        cells.push({ hour, day, value: entry.count, amount: Math.round(entry.amount * 100) / 100 });
      }
    }

    return NextResponse.json({ cells, period, totalSales: sales.length });
  } catch {
    // Devolver datos demo si no hay DB conectada
    const cells = buildDemoData();
    return NextResponse.json({ cells, period, totalSales: cells.reduce((s, c) => s + c.value, 0), demo: true });
  }
}

function buildDemoData(): HeatCell[] {
  const cells: HeatCell[] = [];
  const DAYS_LIST = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const peaks: Record<number, number> = { 7: 0.3, 8: 0.5, 9: 0.7, 10: 0.6, 11: 0.5, 12: 0.9, 13: 0.8, 14: 0.5, 15: 0.4, 16: 0.5, 17: 0.7, 18: 0.95, 19: 0.85, 20: 0.6, 21: 0.3 };
  const dayMult: Record<string, number> = { Lun: 0.8, Mar: 0.75, Mié: 0.85, Jue: 0.8, Vie: 1.0, Sáb: 1.2, Dom: 0.9 };
  for (const day of DAYS_LIST) {
    for (let hour = 0; hour < 24; hour++) {
      const base = peaks[hour] ?? 0;
      const mult = dayMult[day] ?? 1;
      const value = Math.round(base * mult * 18 * (0.85 + Math.random() * 0.3));
      cells.push({ hour, day, value, amount: Math.round(value * 42 * (0.9 + Math.random() * 0.2) * 100) / 100 });
    }
  }
  return cells;
}
