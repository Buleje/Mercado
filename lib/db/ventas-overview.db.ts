import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey, startOfLimaDay } from "@/lib/utils";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { tagVentasOverview } from "@/lib/caja/invalidar-ventas-overview";

// ── Types ──────────────────────────────────────────────────────────────────────

export type VentasRange = "hoy" | "7d" | "30d";

export type ChannelStats = {
  label: string;
  revenue: number;
  orders: number;
};

export type SeriesDay = {
  date: string; // "YYYY-MM-DD"
  marketplace: number;
  tienda: number;
  pos: number;
};

export type PaymentBuckets = {
  efectivo: number;
  yape: number;
  plin: number;
  tarjeta: number;
  fiado: number;
};

export type CashSummary = {
  abierta: boolean;
  /** El esperado del arqueo (`saldoEsperadoDeCaja`): sólo efectivo. */
  saldoActual: number;
  /** Ingresos de HOY en efectivo. */
  ingresos: number;
  /** Egresos de HOY en efectivo. */
  egresos: number;
};

export type TopProduct = {
  name: string;
  image: string | null;
  qty: number;
  revenue: number;
};

/** Totales del período inmediatamente anterior (misma longitud) — para tendencias. */
export type PrevTotals = { revenue: number; orders: number };

/** Distribución por hora del día (0–23) del rango actual — para detectar horas pico. */
export type HourBucket = { hour: number; revenue: number; orders: number };

export type VentasOverviewData = {
  range: VentasRange;
  channels: {
    marketplace: ChannelStats;
    tienda: ChannelStats;
    pos: ChannelStats;
  };
  totals: { revenue: number; orders: number };
  previous: PrevTotals;
  series: SeriesDay[];
  hourly: HourBucket[];
  payments: PaymentBuckets;
  cash: CashSummary;
  topProducts: TopProduct[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

// «Hoy» es el día de LIMA (sin horario de verano: UTC−5 fijo), no el del
// servidor. En Vercel el proceso corre en UTC: con `setHours(0)` el día
// empezaba a las 19:00 de Lima de AYER y las ventas de anoche caían en «hoy»;
// la serie diaria y las horas pico se corrían 5 h (2026-10-09).
const DIA_MS = 24 * 60 * 60 * 1000;
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Devuelve la fecha de inicio del rango (00:00 de Lima). */
export function rangeStart(range: VentasRange, ahora: Date = new Date()): Date {
  const hoy = startOfLimaDay(ahora);
  const days = range === "hoy" ? 0 : range === "7d" ? 7 : 30;
  return new Date(hoy - days * DIA_MS);
}

/** Inicio del período ANTERIOR (misma longitud), para comparar tendencia. */
export function prevRangeStart(range: VentasRange, since: Date): Date {
  const days = range === "hoy" ? 1 : range === "7d" ? 7 : 30;
  return new Date(since.getTime() - days * DIA_MS);
}

/** Date → "YYYY-MM-DD" del día de Lima. */
function toDateKey(d: Date): string {
  return limaDateKey(d);
}

/** Hora 0–23 en Lima. */
export function horaLima(d: Date): number {
  return new Date(d.getTime() - LIMA_OFFSET_MS).getUTCHours();
}

/** Genera todos los días de Lima del rango (inclusive). */
export function buildDateRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let t = startOfLimaDay(from); t <= to.getTime(); t += DIA_MS) {
    days.push(limaDateKey(new Date(t)));
  }
  return days;
}

/** Clasifica método de pago → bucket canónico. */
function classifyPayment(method: string | null | undefined): keyof PaymentBuckets {
  const m = (method ?? "").toLowerCase().trim();
  if (m === "yape") return "yape";
  if (m === "plin") return "plin";
  if (m.startsWith("tarjeta") || m === "card") return "tarjeta";
  if (m === "fiado" || m === "credito") return "fiado";
  return "efectivo";
}

// ── VentasOverviewDB ───────────────────────────────────────────────────────────

export const VentasOverviewDB = {
  /**
   * Agrega todos los datos del Tablero de Ventas en una sola llamada.
   * tenantId SIEMPRE 1er parámetro (multi-tenant guard).
   * Cacheado 2 min por tenant + range. Lee Order (marketplace + tienda),
   * Sale (POS), la caja abierta y sus movimientos. Se invalida con
   * `invalidarVentasOverview(tenantId)` (`lib/caja/invalidar-ventas-overview`)
   * desde: movimientos/apertura/cierre de caja, `POST /api/sales`,
   * `SalesDB.add/delete`, `invalidateAdminCache.afterOrder` (POST/PATCH/DELETE
   * de `/api/orders`), pedidos de marketplace y conversión de cotización.
   * Los cambios de ESTADO de un pedido no alteran este tablero (no filtra por
   * estado), así que los flujos que sólo cambian estado (delivery, bulk-status,
   * MercadoPago webhook) no lo purgan: caduca a los 2 min.
   */
  async get(tenantId: string, range: VentasRange): Promise<VentasOverviewData> {
    "use cache";
    cacheLife({ revalidate: 120, stale: 300 });
    cacheTag(tagVentasOverview(tenantId));

    const since = rangeStart(range);
    const prevSince = prevRangeStart(range, since); // inicio del período anterior
    const now = new Date();

    // ── Fetch paralelo de las 4 fuentes ─────────────────────────────────────
    // Orders/Sales se traen desde prevSince para calcular tendencia (período
    // anterior, misma longitud) en una sola query; luego se parten en
    // actual (createdAt >= since) vs anterior.
    const [allOrders, allSales, openCash, topOrderItems, topSaleItems] =
      await Promise.all([
        // Orders: marketplace + tienda (direct|wholesale), soft-delete = null
        prisma.order.findMany({
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: prevSince },
          },
          select: {
            total: true,
            source: true,
            createdAt: true,
            paymentMethod: true,
          },
        }),

        // Sales POS: select explícito (no usar omit junto a select — Prisma los
        // rechaza; el select ya excluye idempotencyKey y demás campos).
        prisma.sale.findMany({
          where: { tenantId, createdAt: { gte: prevSince } },
          select: {
            total: true,
            payment: true,
            createdAt: true,
          },
        }),

        // Caja abierta actual con TODOS sus movimientos: el saldo es el del
        // arqueo (una caja abierta desde ayer arrastra lo de ayer). Los
        // ingresos/egresos del día se filtran abajo por fecha.
        prisma.cashRegister.findFirst({
          where: { tenantId, status: "abierta" },
          select: {
            openingAmount: true,
            movements: {
              select: { type: true, method: true, amount: true, createdAt: true },
            },
          },
        }),

        // Top OrderItems en el rango (productos con productId)
        prisma.orderItem.findMany({
          where: {
            order: {
              tenantId,
              deletedAt: null,
              createdAt: { gte: since },
            },
            productId: { not: null },
          },
          select: {
            productId: true,
            name: true,
            quantity: true,
            price: true,
            product: {
              select: { image: true },
            },
          },
        }),

        // Top SaleItems en el rango
        prisma.saleItem.findMany({
          where: {
            sale: { tenantId, createdAt: { gte: since } },
          },
          select: {
            productId: true,
            name: true,
            quantity: true,
            price: true,
            product: {
              select: { image: true },
            },
          },
        }),
      ]);

    // ── Partición actual vs período anterior ─────────────────────────────────
    const rawOrders = allOrders.filter((o) => o.createdAt >= since);
    const rawSales = allSales.filter((s) => s.createdAt >= since);
    const prevOrders = allOrders.filter((o) => o.createdAt < since);
    const prevSales = allSales.filter((s) => s.createdAt < since);

    const previous: PrevTotals = {
      revenue:
        prevOrders.reduce((s, o) => s + toNumOrZero(o.total), 0) +
        prevSales.reduce((s, x) => s + toNumOrZero(x.total), 0),
      orders: prevOrders.length + prevSales.length,
    };

    // ── Channels ─────────────────────────────────────────────────────────────
    const channels: VentasOverviewData["channels"] = {
      marketplace: { label: "Marketplace", revenue: 0, orders: 0 },
      tienda: { label: "Tienda online", revenue: 0, orders: 0 },
      pos: { label: "Punto de venta", revenue: 0, orders: 0 },
    };

    for (const o of rawOrders) {
      const rev = toNumOrZero(o.total);
      if (o.source === "marketplace") {
        channels.marketplace.revenue += rev;
        channels.marketplace.orders += 1;
      } else {
        // direct | wholesale → tienda online
        channels.tienda.revenue += rev;
        channels.tienda.orders += 1;
      }
    }
    for (const s of rawSales) {
      channels.pos.revenue += toNumOrZero(s.total);
      channels.pos.orders += 1;
    }

    const totals = {
      revenue:
        channels.marketplace.revenue +
        channels.tienda.revenue +
        channels.pos.revenue,
      orders:
        channels.marketplace.orders +
        channels.tienda.orders +
        channels.pos.orders,
    };

    // ── Series diarias ────────────────────────────────────────────────────────
    const allDays = buildDateRange(since, now);
    const seriesMap: Record<string, SeriesDay> = {};
    for (const d of allDays) {
      seriesMap[d] = { date: d, marketplace: 0, tienda: 0, pos: 0 };
    }

    for (const o of rawOrders) {
      const key = toDateKey(o.createdAt);
      if (!seriesMap[key]) continue;
      const rev = toNumOrZero(o.total);
      if (o.source === "marketplace") {
        seriesMap[key].marketplace += rev;
      } else {
        seriesMap[key].tienda += rev;
      }
    }
    for (const s of rawSales) {
      const key = toDateKey(s.createdAt);
      if (!seriesMap[key]) continue;
      seriesMap[key].pos += toNumOrZero(s.total);
    }

    const series = allDays.map((d) => seriesMap[d]);

    // ── Hourly (horas pico) — distribución del rango actual por hora 0–23 ──────
    const hourly: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      revenue: 0,
      orders: 0,
    }));
    for (const o of rawOrders) {
      const h = horaLima(o.createdAt);
      hourly[h].revenue += toNumOrZero(o.total);
      hourly[h].orders += 1;
    }
    for (const s of rawSales) {
      const h = horaLima(s.createdAt);
      hourly[h].revenue += toNumOrZero(s.total);
      hourly[h].orders += 1;
    }

    // ── Payments ──────────────────────────────────────────────────────────────
    const payments: PaymentBuckets = {
      efectivo: 0,
      yape: 0,
      plin: 0,
      tarjeta: 0,
      fiado: 0,
    };

    for (const s of rawSales) {
      const bucket = classifyPayment(s.payment);
      payments[bucket] += toNumOrZero(s.total);
    }
    for (const o of rawOrders) {
      const bucket = classifyPayment(o.paymentMethod);
      payments[bucket] += toNumOrZero(o.total);
    }

    // ── Cash ──────────────────────────────────────────────────────────────────
    let cash: CashSummary = {
      abierta: false,
      saldoActual: 0,
      ingresos: 0,
      egresos: 0,
    };

    if (openCash) {
      /* LA cuenta del arqueo (`saldoEsperadoDeCaja`, la del cierre y la pantalla
         de caja): sólo efectivo, y la apertura una vez (el movimiento
         «apertura» no suma — QA Brandon 2026-06-10 #1). La copia de antes
         sumaba las ventas por Yape/tarjeta/fiado y restaba los egresos por Yape,
         y sólo miraba los movimientos de HOY. */
      const movs = openCash.movements.map((mv) => ({ type: mv.type, method: mv.method, amount: toNumOrZero(mv.amount), createdAt: mv.createdAt }));
      const desdeHoy = rangeStart("hoy");
      const hoy = saldoEsperadoDeCaja(0, movs.filter((mv) => mv.createdAt >= desdeHoy));
      cash = {
        abierta: true,
        saldoActual: saldoEsperadoDeCaja(toNumOrZero(openCash.openingAmount), movs).esperado,
        ingresos: hoy.ingresos,
        egresos: hoy.egresos,
      };
    }

    // ── Top Products ──────────────────────────────────────────────────────────
    // Combina OrderItem + SaleItem por productId, agrega qty y revenue
    const productMap = new Map<
      number,
      { name: string; image: string | null; qty: number; revenue: number }
    >();

    for (const item of topOrderItems) {
      if (item.productId == null) continue;
      const rev = toNumOrZero(item.price) * item.quantity;
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.qty += item.quantity;
        existing.revenue += rev;
      } else {
        productMap.set(item.productId, {
          name: item.name,
          image: item.product?.image || null,
          qty: item.quantity,
          revenue: rev,
        });
      }
    }

    for (const item of topSaleItems) {
      const rev = toNumOrZero(item.price) * item.quantity;
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.qty += item.quantity;
        existing.revenue += rev;
      } else {
        productMap.set(item.productId, {
          name: item.name,
          image: item.product?.image || null,
          qty: item.quantity,
          revenue: rev,
        });
      }
    }

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6)
      .map((p) => ({
        name: p.name,
        image: p.image || null,
        qty: p.qty,
        revenue: Math.round(p.revenue * 100) / 100,
      }));

    return {
      range,
      channels,
      totals,
      previous,
      series,
      hourly,
      payments,
      cash,
      topProducts,
    };
  },
};
