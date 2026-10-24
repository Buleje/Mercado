import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsABCDB } from "@/lib/db/analytics-abc.db";
import { logger } from "@/lib/logger";

export type BCGQuadrant = "estrella" | "vaca" | "interrogante" | "perro";

export type BCGProduct = {
  productId: number;
  name: string;
  category: string;
  revenue: number;
  units: number;
  growth: number;
  /** Participación en TUS ventas del período (no hay visibilidad del mercado
   *  externo/competencia — la matriz clásica usa cuota de mercado real, acá
   *  se usa la cuota dentro del propio catálogo, que es lo medible). */
  marketShare: number;
  quadrant: BCGQuadrant;
};

const DIAS_VENTANA = 30;

/**
 * GET /api/analytics/bcg
 *
 * Matriz BCG (crecimiento × participación) por producto, comparando los
 * últimos 30 días contra los 30 anteriores. Reusa `AnalyticsABCDB` (mismo
 * origen de datos que /api/analytics/abc) con ventanas de fecha.
 *
 * Honestidad de datos: "participación" acá es SIEMPRE relativa al propio
 * catálogo del tenant (no hay dato de mercado externo/competencia) — los
 * cuadrantes se arman por MEDIANA relativa al propio catálogo (no un
 * umbral fijo inventado), así cada negocio se compara consigo mismo.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;
    const now = new Date();
    const inicioActual = new Date(now);
    inicioActual.setDate(inicioActual.getDate() - DIAS_VENTANA);
    const inicioAnterior = new Date(inicioActual);
    inicioAnterior.setDate(inicioAnterior.getDate() - DIAS_VENTANA);

    const [saleActual, orderActual, salePrevio, orderPrevio] = await Promise.all([
      AnalyticsABCDB.getSaleItemsForABC(tenantId, { gte: inicioActual }),
      AnalyticsABCDB.getOrderItemsForABC(tenantId, { gte: inicioActual }),
      AnalyticsABCDB.getSaleItemsForABC(tenantId, { gte: inicioAnterior, lt: inicioActual }),
      AnalyticsABCDB.getOrderItemsForABC(tenantId, { gte: inicioAnterior, lt: inicioActual }),
    ]);

    const agregar = (items: { productId: number | null; price: number; quantity: number }[]) => {
      const map = new Map<number, { revenue: number; units: number }>();
      for (const item of items) {
        if (item.productId == null) continue;
        const existing = map.get(item.productId) ?? { revenue: 0, units: 0 };
        existing.revenue += item.price * item.quantity;
        existing.units += item.quantity;
        map.set(item.productId, existing);
      }
      return map;
    };

    const actual = agregar([...saleActual, ...orderActual]);
    const previo = agregar([...salePrevio, ...orderPrevio]);

    if (actual.size === 0) {
      return NextResponse.json([]);
    }

    const productIds = Array.from(actual.keys());
    const meta = await AnalyticsABCDB.getProductMetaForABC(tenantId, productIds);
    const metaMap = new Map(meta.map((p) => [p.id, p]));

    const totalRevenueActual = Array.from(actual.values()).reduce((s, v) => s + v.revenue, 0);
    if (totalRevenueActual === 0) return NextResponse.json([]);

    const pctChange = (current: number, prev: number): number => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / prev) * 10000) / 100;
    };

    const sinClasificar = Array.from(actual.entries()).map(([productId, v]) => {
      const prev = previo.get(productId) ?? { revenue: 0, units: 0 };
      const growth = pctChange(v.revenue, prev.revenue);
      const marketShare = Math.round((v.revenue / totalRevenueActual) * 10000) / 100;
      const p = metaMap.get(productId);
      return {
        productId,
        name: p?.name ?? `Producto #${productId}`,
        category: p?.category ?? "",
        revenue: Math.round(v.revenue * 100) / 100,
        units: v.units,
        growth,
        marketShare,
      };
    });

    // Cuadrantes por MEDIANA del propio catálogo — no un umbral fijo inventado.
    const growths = sinClasificar.map((p) => p.growth).sort((a, b) => a - b);
    const shares = sinClasificar.map((p) => p.marketShare).sort((a, b) => a - b);
    const mediana = (arr: number[]): number => {
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };
    const medianaCrecimiento = mediana(growths);
    const medianaParticipacion = mediana(shares);

    const result: BCGProduct[] = sinClasificar.map((p) => {
      const altoCrecimiento = p.growth >= medianaCrecimiento;
      const altaParticipacion = p.marketShare >= medianaParticipacion;
      const quadrant: BCGQuadrant =
        altoCrecimiento && altaParticipacion
          ? "estrella"
          : !altoCrecimiento && altaParticipacion
            ? "vaca"
            : altoCrecimiento && !altaParticipacion
              ? "interrogante"
              : "perro";
      return { ...p, quadrant };
    });

    result.sort((a, b) => b.revenue - a.revenue);
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[bcg] error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
