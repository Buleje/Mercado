import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

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
  saldoActual: number;
  ingresos: number;
  egresos: number;
};

export type TopProduct = {
  name: string;
  image: string | null;
  qty: number;
  revenue: number;
};

export type VentasOverviewData = {
  range: VentasRange;
  channels: {
    marketplace: ChannelStats;
    tienda: ChannelStats;
    pos: ChannelStats;
  };
  totals: { revenue: number; orders: number };
  series: SeriesDay[];
  payments: PaymentBuckets;
  cash: CashSummary;
  topProducts: TopProduct[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Devuelve la fecha de inicio del rango (00:00:00 servidor). */
function rangeStart(range: VentasRange): Date {
  const now = new Date();
  if (range === "hoy") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  const days = range === "7d" ? 7 : 30;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Formatea Date → "YYYY-MM-DD" (local). */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Genera todos los días del rango (inclusive). */
function buildDateRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  while (cur <= to) {
    days.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
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
   * Cacheado 2 min por tenant + range; invalidado externamente con
   * revalidateTag(`ventas-overview-${tenantId}`) tras writes de Sale/Order.
   */
  async get(tenantId: string, range: VentasRange): Promise<VentasOverviewData> {
    "use cache";
    cacheLife({ revalidate: 120, stale: 300 });
    cacheTag(`ventas-overview-${tenantId}`);

    const since = rangeStart(range);
    const now = new Date();

    // ── Fetch paralelo de las 4 fuentes ─────────────────────────────────────
    const [rawOrders, rawSales, openCash, topOrderItems, topSaleItems] =
      await Promise.all([
        // Orders: marketplace + tienda (direct|wholesale), soft-delete = null
        prisma.order.findMany({
          where: {
            tenantId,
            deletedAt: null,
            createdAt: { gte: since },
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
          where: { tenantId, createdAt: { gte: since } },
          select: {
            total: true,
            payment: true,
            createdAt: true,
          },
        }),

        // Caja abierta actual con movimientos del día para ingresos/egresos
        prisma.cashRegister.findFirst({
          where: { tenantId, status: "abierta" },
          select: {
            openingAmount: true,
            movements: {
              where: { createdAt: { gte: rangeStart("hoy") } },
              select: { type: true, amount: true },
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
      let saldoActual = toNumOrZero(openCash.openingAmount);
      let ingresos = 0;
      let egresos = 0;

      for (const mv of openCash.movements) {
        const amt = toNumOrZero(mv.amount);
        if (mv.type === "venta" || mv.type === "apertura") {
          saldoActual += amt;
        } else if (mv.type === "ingreso") {
          saldoActual += amt;
          ingresos += amt;
        } else if (mv.type === "egreso") {
          saldoActual -= amt;
          egresos += amt;
        }
        // tipo "cierre" no aparece en caja abierta; se ignora
      }

      cash = { abierta: true, saldoActual, ingresos, egresos };
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
      series,
      payments,
      cash,
      topProducts,
    };
  },
};
