import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/analytics/cash-flow
 * 30-day cash flow: ingresos vs egresos per day, running balance, 7-day projection.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const tenantFilter = { tenantId: auth.tenantId };

    // Fetch all data in parallel
    const [sales, fiadoCuotas, expenses, payments] = await Promise.allSettled([
      // Ingresos: ventas directas
      prisma.sale.findMany({
        where: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } },
        select: { total: true, createdAt: true },
      }),
      // Ingresos: cobros de fiados
      (async () => {
        try {
          return await prisma.fiadoCuota.findMany({
            where: {
              pagadoEn: { not: null, gte: thirtyDaysAgo },
              fiado: { ...tenantFilter },
            },
            select: { monto: true, pagadoEn: true },
          });
        } catch {
          return [];
        }
      })(),
      // Egresos: gastos operativos
      (async () => {
        try {
          return await prisma.expense.findMany({
            where: { ...tenantFilter, date: { gte: thirtyDaysAgo } },
            select: { amount: true, date: true },
          });
        } catch {
          return [];
        }
      })(),
      // Egresos: pagos a proveedores
      (async () => {
        try {
          return await prisma.payment.findMany({
            where: {
              date: { gte: thirtyDaysAgo },
              payable: { ...tenantFilter },
            },
            select: { amount: true, date: true },
          });
        } catch {
          return [];
        }
      })(),
    ]);

    // Build daily map
    type DayFlow = { ingresos: number; egresos: number };
    const dailyMap = new Map<string, DayFlow>();

    // Initialize all 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().slice(0, 10), { ingresos: 0, egresos: 0 });
    }

    // Accumulate sales
    if (sales.status === "fulfilled") {
      for (const sale of sales.value) {
        const key = sale.createdAt.toISOString().slice(0, 10);
        const day = dailyMap.get(key);
        if (day) day.ingresos += sale.total;
      }
    }

    // Accumulate fiado cuotas cobradas
    if (fiadoCuotas.status === "fulfilled") {
      for (const cuota of fiadoCuotas.value) {
        if (!cuota.pagadoEn) continue;
        const key = cuota.pagadoEn.toISOString().slice(0, 10);
        const day = dailyMap.get(key);
        if (day) day.ingresos += Number(cuota.monto);
      }
    }

    // Accumulate expenses
    if (expenses.status === "fulfilled") {
      for (const expense of expenses.value) {
        const key = expense.date.toISOString().slice(0, 10);
        const day = dailyMap.get(key);
        if (day) day.egresos += expense.amount;
      }
    }

    // Accumulate supplier payments
    if (payments.status === "fulfilled") {
      for (const payment of payments.value) {
        const key = payment.date.toISOString().slice(0, 10);
        const day = dailyMap.get(key);
        if (day) day.egresos += payment.amount;
      }
    }

    // Build response with running balance
    let balance = 0;
    const dias: {
      fecha: string;
      ingresos: number;
      egresos: number;
      balance: number;
      isProjected: boolean;
    }[] = [];

    const sortedKeys = Array.from(dailyMap.keys()).sort();
    for (const key of sortedKeys) {
      const day = dailyMap.get(key)!;
      balance += day.ingresos - day.egresos;
      dias.push({
        fecha: key,
        ingresos: Math.round(day.ingresos * 100) / 100,
        egresos: Math.round(day.egresos * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        isProjected: false,
      });
    }

    // Projection: next 7 days based on average of last 7 days
    const last7 = dias.slice(-7);
    const avgIngreso = last7.reduce((s, d) => s + d.ingresos, 0) / Math.max(last7.length, 1);
    const avgEgreso = last7.reduce((s, d) => s + d.egresos, 0) / Math.max(last7.length, 1);

    for (let i = 1; i <= 7; i++) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + i);
      balance += avgIngreso - avgEgreso;
      dias.push({
        fecha: d.toISOString().slice(0, 10),
        ingresos: Math.round(avgIngreso * 100) / 100,
        egresos: Math.round(avgEgreso * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        isProjected: true,
      });
    }

    const totalIngresos = dias.filter((d) => !d.isProjected).reduce((s, d) => s + d.ingresos, 0);
    const totalEgresos = dias.filter((d) => !d.isProjected).reduce((s, d) => s + d.egresos, 0);
    const realDays = dias.filter((d) => !d.isProjected).length;

    return NextResponse.json({
      dias,
      resumen: {
        promedioIngreso: Math.round((totalIngresos / Math.max(realDays, 1)) * 100) / 100,
        promedioEgreso: Math.round((totalEgresos / Math.max(realDays, 1)) * 100) / 100,
        saldoProyectado7d: dias[dias.length - 1]?.balance ?? 0,
      },
    });
  } catch (e) {
    console.error("[analytics/cash-flow] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
