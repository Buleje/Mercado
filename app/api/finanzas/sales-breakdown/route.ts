import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { utcMonthRange, utcDayKey } from "@/lib/finance/monthly-range";
import { logger } from "@/lib/logger";

/**
 * GET /api/finanzas/sales-breakdown?days=30
 *
 * Dos breakdowns de ventas (Sale) agregados server-side para el dashboard de
 * Finanzas, reemplazando el fetch de /api/sales?limit=5000:
 *   - paymentMethods: Σ total por método de pago (campo real `payment`),
 *     mes actual. FIX: el cliente leía `paymentMethod`/`metodoPago` (campos
 *     inexistentes) → mostraba todo como "Efectivo".
 *   - daily: ingresos por día (UTC) de los últimos `days` días.
 *
 * @prisma-direct ok — agregados/consultas con scope explícito por `auth.tenantId`.
 * Bucketing UTC (utcMonthRange / utcDayKey) → coincide con el cliente.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = Math.min(90, Math.max(1, Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30));

  try {
    const payload = await getOrSet(
      `finanzas:sales-breakdown:${auth.tenantId}:${days}`,
      120,
      async () => {
        const ref = new Date();
        const monthStart = utcMonthRange(ref, 0).start;
        const windowStart = new Date(
          Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - (days - 1)),
        );

        const [pmRows, windowSales] = await Promise.all([
          // Métodos de pago del mes actual — agregado en DB por `payment`.
          prisma.sale.groupBy({
            by: ["payment"],
            _sum: { total: true },
            where: { tenantId: auth.tenantId, createdAt: { gte: monthStart } },
          }),
          // Ventana acotada (no all-time) para el cashflow diario.
          prisma.sale.findMany({
            where: { tenantId: auth.tenantId, createdAt: { gte: windowStart } },
            select: { createdAt: true, total: true },
          }),
        ]);

        const paymentMethods = pmRows
          .map((r) => {
            const raw = r.payment ?? "efectivo";
            return {
              name: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
              value: Math.round(toNumOrZero(r._sum.total)),
            };
          })
          .filter((g) => g.value > 0)
          .sort((a, b) => b.value - a.value);

        const dayMap = new Map<string, number>();
        for (const s of windowSales) {
          const key = s.createdAt.toISOString().slice(0, 10);
          dayMap.set(key, (dayMap.get(key) ?? 0) + toNumOrZero(s.total));
        }
        const daily: { day: string; ingresos: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const key = utcDayKey(ref, i);
          daily.push({ day: key, ingresos: Math.round(dayMap.get(key) ?? 0) });
        }

        return { paymentMethods, daily };
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/sales-breakdown] failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo cargar el desglose de ventas" }, { status: 500 });
  }
}
