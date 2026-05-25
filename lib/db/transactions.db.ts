import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type TransactionSource = "pos" | "tienda" | "marketplace" | "all";

export type TransactionFilters = {
  from: Date;
  to: Date;
  source: TransactionSource;
  q?: string;
  page: number;   // 1-indexed
  limit: number;  // max 100
};

export type TransactionItem = {
  id: string;
  source: "pos" | "tienda" | "marketplace";
  createdAt: string; // ISO
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  payment: string;
  status: string;
  itemCount: number;
  itemsPreview: string;
  items: { name: string; quantity: number; price: number; unit: string }[];
};

export type TransactionsResult = {
  items: TransactionItem[];
  total: number;
  hasMore: boolean;
  kpis: {
    count: number;
    sum: number;
    avg: number;
    bySource: { pos: number; tienda: number; marketplace: number };
  };
};

// ── Helper interno ─────────────────────────────────────────────────────────────

/**
 * Genera una cadena "preview" de los primeros 2 items de una venta.
 * Ej: "Coca Cola × 2, Arroz × 1 +3"
 */
function previewItems(items: { name: string; quantity: number }[]): string {
  if (items.length === 0) return "—";
  const first = items
    .slice(0, 2)
    .map((i) => `${i.name} × ${i.quantity}`)
    .join(", ");
  if (items.length > 2) return `${first} +${items.length - 2}`;
  return first;
}

// ── Clase principal ────────────────────────────────────────────────────────────

/**
 * TransactionsDB
 *
 * Vista consolidada de ventas multi-fuente para un tenant:
 *  - POS       → modelo `Sale`
 *  - Tienda    → modelo `Order` (source = "direct" | "wholesale")
 *  - Marketplace → modelo `Order` (source = "marketplace")
 *
 * Regla crítica: `tenantId` es SIEMPRE el primer parámetro de cada método.
 * Todas las queries incluyen `tenantId` en el WHERE; sin él Prisma devolvería
 * data cross-tenant.
 */
export class TransactionsDB {
  /**
   * Listado paginado + KPIs de transacciones de un tenant.
   *
   * Estrategia de paginación (replicada del route handler, audit C3 2026-05-17):
   *  - source != "all" → skip/take directo sobre la fuente. Exacto a cualquier
   *    profundidad de página.
   *  - source == "all" → fetch de las primeras min(page*limit, 1000) rows de
   *    cada fuente, merge in-memory ordenado por fecha desc, luego slice.
   *    Cap MERGE_HARD_CAP=1000 protege memoria. Suficiente para 20 páginas de 50.
   *
   * KPIs sum/avg: calculados sobre el dataset descargado (cap 1000 en "all").
   * bySource: siempre DB-authoritative (count separado por fuente).
   */
  static async list(
    tenantId: string,
    filters: TransactionFilters,
  ): Promise<TransactionsResult> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:transactions`);
    const { from, to, source, q, page, limit } = filters;

    const needSales = source === "pos" || source === "all";
    const needOrders =
      source === "tienda" || source === "marketplace" || source === "all";

    const qTrim = q?.trim();

    // WHERE para ventas POS (modelo Sale)
    const saleWhere = {
      tenantId,
      createdAt: { gte: from, lte: to },
      ...(qTrim
        ? {
            OR: [
              { id: { contains: qTrim, mode: "insensitive" as const } },
              { customerPhone: { contains: qTrim, mode: "insensitive" as const } },
              { customer: { name: { contains: qTrim, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    // Filtro de source para pedidos (modelo Order)
    const orderSourceFilter =
      source === "tienda"
        ? { in: ["direct", "wholesale"] }
        : source === "marketplace"
          ? { equals: "marketplace" as const }
          : undefined;

    // WHERE para pedidos (unificado — cubre tienda + marketplace cuando source=all)
    const orderWhere = {
      tenantId,
      deletedAt: null,
      createdAt: { gte: from, lte: to },
      ...(orderSourceFilter ? { source: orderSourceFilter } : {}),
      ...(qTrim
        ? {
            OR: [
              { id: { contains: qTrim, mode: "insensitive" as const } },
              { customerName: { contains: qTrim, mode: "insensitive" as const } },
              { customerPhone: { contains: qTrim, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    // WHERE separados por fuente para counts autoritativos en bySource
    const tiendaWhere = { ...orderWhere, source: { in: ["direct", "wholesale"] } };
    const marketplaceWhere = {
      ...orderWhere,
      source: { equals: "marketplace" as const },
    };

    // Parámetros de paginación según estrategia
    const MERGE_HARD_CAP = 1000;
    const fetchSize =
      source === "all" ? Math.min(MERGE_HARD_CAP, page * limit) : page * limit;
    const skipPerSource = source === "all" ? 0 : (page - 1) * limit;
    const takePerSource = source === "all" ? fetchSize : limit;

    // Queries paralelas: counts + datos
    const [saleCount, tiendaCount, marketplaceCount, orderCount, sales, orders] =
      await Promise.all([
        needSales
          ? prisma.sale.count({ where: saleWhere })
          : Promise.resolve(0),
        needOrders && source !== "marketplace"
          ? prisma.order.count({ where: tiendaWhere })
          : Promise.resolve(0),
        needOrders && source !== "tienda"
          ? prisma.order.count({ where: marketplaceWhere })
          : Promise.resolve(0),
        needOrders
          ? prisma.order.count({ where: orderWhere })
          : Promise.resolve(0),
        needSales
          ? prisma.sale.findMany({
              where: saleWhere,
              include: {
                items: { select: { name: true, quantity: true, price: true, unit: true } },
                customer: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
              skip: skipPerSource,
              take: takePerSource,
            })
          : Promise.resolve([]),
        needOrders
          ? prisma.order.findMany({
              where: orderWhere,
              include: {
                items: { select: { name: true, quantity: true, price: true, unit: true } },
              },
              orderBy: { createdAt: "desc" },
              skip: skipPerSource,
              take: takePerSource,
            })
          : Promise.resolve([]),
      ]);

    // ── Normalizar a TransactionItem ─────────────────────────────────────────

    const salesItems: TransactionItem[] = sales.map((s) => {
      const items = s.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: toNumOrZero(i.price),
        unit: i.unit,
      }));
      return {
        id: s.id,
        source: "pos" as const,
        createdAt: s.createdAt.toISOString(),
        customerName: s.customer?.name ?? null,
        customerPhone: s.customerPhone ?? null,
        total: toNumOrZero(s.total),
        payment: s.payment ?? "efectivo",
        status: "completada",
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        itemsPreview: previewItems(items),
        items,
      };
    });

    const orderItems: TransactionItem[] = orders.map((o) => {
      const items = o.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: toNumOrZero(i.price),
        unit: i.unit,
      }));
      const uiSource: TransactionItem["source"] =
        o.source === "marketplace" ? "marketplace" : "tienda";
      return {
        id: o.id,
        source: uiSource,
        createdAt: o.createdAt.toISOString(),
        customerName: o.customerName,
        customerPhone: o.customerPhone ?? null,
        total: toNumOrZero(o.total),
        payment: o.paymentMethod ?? "—",
        status: o.status,
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        itemsPreview: previewItems(items),
        items,
      };
    });

    // ── Paginación + merge ───────────────────────────────────────────────────

    const total = saleCount + orderCount;
    let pageItems: TransactionItem[];
    let hasMore: boolean;

    if (source === "all") {
      // Merge + sort estable por fecha desc sobre el dataset ya descargado
      const merged = [...salesItems, ...orderItems].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      const start = (page - 1) * limit;
      pageItems = merged.slice(start, start + limit);
      // hasMore = quedan items en el merge actual OR cap global alcanzado
      const capHit = fetchSize >= MERGE_HARD_CAP && total > MERGE_HARD_CAP;
      hasMore =
        merged.length > start + limit ||
        (capHit && start + limit >= merged.length);
    } else {
      // Una sola fuente: skip/take ya aplicados en la query
      pageItems = [...salesItems, ...orderItems];
      hasMore = total > page * limit;
    }

    // ── KPIs ─────────────────────────────────────────────────────────────────
    // sum/avg: calculados sobre el dataset descargado.
    // Trade-off: cuando source="all" y total > 1000, cubren solo las 1000
    // transacciones más recientes del rango. bySource siempre es DB-exact.
    const aggregatedSet = [...salesItems, ...orderItems];
    const sum = aggregatedSet.reduce((acc, t) => acc + t.total, 0);
    const avg = aggregatedSet.length > 0 ? sum / aggregatedSet.length : 0;

    return {
      items: pageItems,
      total,
      hasMore,
      kpis: {
        count: total,
        sum,
        avg,
        bySource: {
          pos: saleCount,
          tienda: tiendaCount,
          marketplace: marketplaceCount,
        },
      },
    };
  }
}
