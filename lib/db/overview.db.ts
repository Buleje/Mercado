import "server-only";

/**
 * lib/db/overview.db.ts
 *
 * Único proveedor de las 9 queries paralelas del endpoint
 * `app/api/admin/overview/route.ts` (Resumen del admin home).
 *
 * Brandon 2026-05-16 (audit P1): migración desde Prisma directo en
 * route.ts a lib/db (cumple regla crítica #1). El route mantiene la
 * lógica de aggregation, heatmap, insight y alerts — esta clase solo
 * lee y devuelve raw data.
 *
 * Sin caché propio: el caller maneja TTL/invalidate cuando lo necesite.
 * Cada query es resiliente (best-effort) — fallos individuales se
 * loguean en el caller y se reemplazan por valores vacíos para no
 * romper el render completo del dashboard.
 */

import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";

// La regla del pedido «olvidado» vive en lib/admin/pedidos-olvidados.ts: la
// lista de Pedidos la aplica igual en el navegador.
import { ESTADOS_PEDIDO_VIVO, HORAS_PEDIDO_OLVIDADO } from "@/lib/admin/pedidos-olvidados";
export { HORAS_PEDIDO_OLVIDADO };

/** Conteos del catálogo activo — misma regla que `lib/inventario/catalogo-incompleto.ts`. */
export interface CatalogoDeInicio {
  /** Productos con stock gestionado en o bajo su mínimo (5 si no tiene) — el «Bajo stock» de Inventario. */
  bajoStock: number;
  sinCosto: number;
  sinCodigo: number;
  sinMinimo: number;
  /** Les falta al menos uno de los tres. */
  incompletos: number;
}

export interface OverviewQueryOpts {
  tenantId: string;
  rangeFrom: Date;
  rangeTo: Date;
  prevFrom: Date;
  prevTo: Date;
  startOf30dAgo: Date;
  now: Date;
}

export interface OverviewRawData {
  rangeOrders: Array<{ total: number; customerPhone: string | null; createdAt: Date }>;
  prevOrders: Array<{ total: number }>;
  activeOrders: number;
  last30dOrders: Array<{ createdAt: Date }>;
  criticalStockCount: number;
  expiringCount: number;
  overdueCreditCount: number;
  /** Pedidos vivos sin tocar hace más de `HORAS_PEDIDO_OLVIDADO` (sólo lectura). */
  pedidosOlvidados: { cuantos: number; monto: number; desde: Date | null };
  catalogo: CatalogoDeInicio;
  topProducts: Array<{ productId: number | null; _sum: { quantity: number | null } }>;
  newCustomersInRange: number;
}

export const OverviewDB = {
  /**
   * Trae las 9 queries paralelas del overview. Si alguna falla
   * individualmente, el caller decide cómo manejarlo (logger + fallback
   * a valor vacío). Acá NO atrapamos errores — los propagamos para
   * que el caller los enrute a su logCatch helper.
   *
   * Tenant-scoped: TODAS las queries filtran por `tenantId` en su WHERE.
   * Multi-tenant isolation verificado: ninguna query lee otro tenant.
   */
  async fetchOverview(opts: OverviewQueryOpts): Promise<OverviewRawData> {
    const { tenantId, rangeFrom, rangeTo, prevFrom, prevTo, startOf30dAgo, now } = opts;
    // Un solo stock mínimo (09-10): el global del negocio, una vez por pedido.
    const minimoGlobal = await minimoGlobalDelNegocio(tenantId);

    const [
      rangeOrders,
      prevOrders,
      activeOrders,
      last30dOrders,
      catalogoFilas,
      expiringCount,
      overdueCreditCount,
      topProducts,
      newCustomersInRange,
      rangeSales,
      prevSales,
      last30dSales,
      olvidados,
    ] = await Promise.all([
      // 1. Pedidos entregados en el rango — para revenue, ticket promedio, uniqueCustomers.
      // Brandon mayo 2026 v7: solo `entregado` cuenta como venta real.
       
      prisma.order.findMany({
        where: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo }, status: "entregado" },
        select: { total: true, customerPhone: true, createdAt: true },
      }),

      // 2. Pedidos entregados en la ventana previa equivalente — delta vs anterior.
       
      prisma.order.findMany({
        where: { tenantId, createdAt: { gte: prevFrom, lte: prevTo }, status: "entregado" },
        select: { total: true },
      }),

      // 3. Activos = pedidos vivos que aún no se cerraron. Incluye preparando
      // (operativo, no contable — un pedido en preparación NO es venta hasta entregar).
       
      prisma.order.count({
        where: {
          tenantId,
          status: { in: ["pendiente", "confirmado", "preparando", "en_camino"] },
        },
      }),

      // 4. Últimos 30 días (no depende del rango) — para heatmap hora×día.
      // take:5000 cap defensivo para tenants muy activos. Migrar a SQL
      // GROUP BY EXTRACT(...) cuando el cap se quede corto (P2 perf).
       
      prisma.order.findMany({
        where: { tenantId, createdAt: { gte: startOf30dAgo, lte: rangeTo }, status: "entregado" },
        select: { createdAt: true },
        take: 5000,
      }),

      // 5. Catálogo en UNA pasada: «Bajo stock» con la regla de Inventario
      // (`enStockBajo`: el mínimo propio o `Settings.globalMinStock`, agotados
      // incluidos — 09-10 dejó de ser un 5 fijo; antes contaba sólo 1-5 y
      // el aviso no coincidía con lo que el filtro mostraba) y los datos que le
      // faltan (`lib/inventario/catalogo-incompleto.ts`). Sin borrados ni
      // servicios. Parámetros por plantilla de Prisma, nunca interpolados.
      prisma.$queryRaw<CatalogoDeInicio[]>`
        SELECT
          count(*) FILTER (WHERE stock IS NOT NULL AND stock <= COALESCE("stockMin", ${minimoGlobal}::int))::int AS "bajoStock",
          count(*) FILTER (WHERE type <> 'service' AND COALESCE("costPrice", 0) <= 0)::int AS "sinCosto",
          count(*) FILTER (WHERE type <> 'service' AND COALESCE(btrim(barcode), '') = '')::int AS "sinCodigo",
          count(*) FILTER (WHERE type <> 'service' AND stock IS NOT NULL AND "stockMin" IS NULL)::int AS "sinMinimo",
          count(*) FILTER (WHERE type <> 'service' AND (
            COALESCE("costPrice", 0) <= 0
            OR COALESCE(btrim(barcode), '') = ''
            OR (stock IS NOT NULL AND "stockMin" IS NULL)
          ))::int AS "incompletos"
        FROM "Product"
        WHERE "tenantId" = ${tenantId} AND active = true AND "deletedAt" IS NULL
      `,

      // 6. Vencimientos próximos — productos cuyo expiresAt está dentro de 7 días.
       
      prisma.product.count({
        where: {
          tenantId,
          expiresAt: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
          active: true,
          deletedAt: null,
        },
      }),

      // 7. Fiados vencidos del tenant.
       
      prisma.fiado.count({
        where: { tenantId, status: "VENCIDO" },
      }),

      // 8. Top 5 productos por unidades entregadas en el rango.
      // Filtro `order.tenantId` mantiene el aislamiento — un ataque no puede
      // contar items de otro tenant.
       
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo }, status: "entregado" },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),

      // 9. Nuevos clientes registrados en el rango.
       
      prisma.customer.count({
        where: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo } },
      }),

      // 10. Ventas POS (Sale) en el rango. Un tenant POS-only (bodega) no genera
      // Order pero sí Sale → sin esto el home mostraba "Ventas del mes S/0" aunque
      // hubiera ventas en caja (bug de auditoría 2026-06). Order y Sale son canales
      // independientes (Sale no tiene FK a Order) → sumar no duplica.
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo } },
        select: { total: true, customerPhone: true, createdAt: true },
      }),

      // 11. Ventas POS en la ventana previa equivalente — delta vs anterior.
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: prevFrom, lte: prevTo } },
        select: { total: true },
      }),

      // 12. Ventas POS últimos 30 días — para el heatmap hora×día.
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: startOf30dAgo, lte: rangeTo } },
        select: { createdAt: true },
        take: 5000,
      }),

      // 13. Pedidos olvidados: vivos y sin tocar hace más de HORAS_PEDIDO_OLVIDADO.
      // Sólo lectura (orders.db es la máquina de estados; acá no se mueve nada).
      prisma.order.aggregate({
        where: {
          tenantId,
          status: { in: [...ESTADOS_PEDIDO_VIVO] },
          updatedAt: { lt: new Date(now.getTime() - HORAS_PEDIDO_OLVIDADO * 60 * 60 * 1000) },
        },
        _count: { _all: true },
        _sum: { total: true },
        _min: { updatedAt: true },
      }),
    ]);

    const catalogo: CatalogoDeInicio = catalogoFilas[0] ?? {
      bajoStock: 0, sinCosto: 0, sinCodigo: 0, sinMinimo: 0, incompletos: 0,
    };

    // Brandon 2026-05-17 (audit tsc): Order.total es Decimal en Prisma 7 pero
    // el interface OverviewRawData declara number. Sin coerción explícita los
    // 47 errores de FinanzasModule cascadean (TS infiere {} al consumir).
    // toNumOrZero normaliza Decimal | string | null → number.
    return {
      // Merge canales: pedidos (Order entregado) + ventas POS (Sale). Así el home
      // refleja TODO el ingreso — revenue, ticket, sparkline, buckets y clientes
      // únicos incluyen ambas fuentes.
      rangeOrders: [
        ...rangeOrders.map((o) => ({
          total: toNumOrZero(o.total),
          customerPhone: o.customerPhone,
          createdAt: o.createdAt,
        })),
        ...rangeSales.map((s) => ({
          total: toNumOrZero(s.total),
          customerPhone: s.customerPhone,
          createdAt: s.createdAt,
        })),
      ],
      prevOrders: [
        ...prevOrders.map((o) => ({ total: toNumOrZero(o.total) })),
        ...prevSales.map((s) => ({ total: toNumOrZero(s.total) })),
      ],
      activeOrders,
      last30dOrders: [...last30dOrders, ...last30dSales],
      criticalStockCount: catalogo.bajoStock,
      expiringCount,
      overdueCreditCount,
      pedidosOlvidados: {
        cuantos: olvidados._count._all,
        monto: toNumOrZero(olvidados._sum.total),
        desde: olvidados._min.updatedAt,
      },
      catalogo,
      topProducts,
      newCustomersInRange,
    };
  },
};
