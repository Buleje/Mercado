import "server-only";

/**
 * lib/db/admin-stats.db.ts
 *
 * Audit project-wide 2026-05-19: migracion de prisma directo en
 * app/api/admin/stats/route.ts a clase DB canonica (regla #1 CLAUDE.md).
 *
 * Dos consultas en paralelo (no transacciones): las 11 cuentas en una sola
 * ida y el stock bajo (comparacion columna-columna, raw SQL).
 */

import { prisma } from "@/lib/prisma";
import { startOfLimaDay } from "@/lib/utils";
import { withDbRetry } from "@/lib/db-retry";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";

export type AdminStatsPayload = {
  pendingOrders: number;
  oldPendingOrders: number;
  todayOrders: number;
  todayRevenue: number;
  /** Ventas (entregadas) de AYER — alimenta el "Ayer vendiste X" del briefing. */
  salesYesterday: number;
  lowStockProducts: number;
  weekOrders: number;
  totalCustomers: number;
  overduePayables: number;
  /** Fiados de CLIENTE vencidos sin saldar (≠ overduePayables, que son a proveedores). */
  overdueFiados: number;
  /** Pedidos pendientes pagados con Yape esperando que el dueño verifique el pago. */
  pendingYape: number;
  /** Mensajes de WhatsApp entrantes sin leer (badge de Mensajes en el sidebar). */
  waUnread: number;
  generatedAt: string;
};

/** Fila de la consulta única de la cabecera (int/float8 llegan como number). */
type FilaCuentas = {
  pendingOrders: number;
  oldPendingOrders: number;
  todayOrders: number;
  todayRevenue: number | string | null;
  salesYesterday: number | string | null;
  weekOrders: number;
  totalCustomers: number;
  overduePayables: number;
  overdueFiados: number;
  pendingYape: number;
  waUnread: number;
};

const CUENTAS_EN_CERO: FilaCuentas = {
  pendingOrders: 0,
  oldPendingOrders: 0,
  todayOrders: 0,
  todayRevenue: 0,
  salesYesterday: 0,
  weekOrders: 0,
  totalCustomers: 0,
  overduePayables: 0,
  overdueFiados: 0,
  pendingYape: 0,
  waUnread: 0,
};

export const AdminStatsDB = {
  /**
   * Devuelve los 8 contadores del header del admin panel.
   * Pensado para ser envuelto en getOrSet con TTL 30s en el route handler.
   *
   * @param tenantId  Tenant scope (obligatorio regla #3 CLAUDE.md)
   */
  async getHeaderStats(tenantId: string): Promise<AdminStatsPayload> {
    const now = new Date();
    // Días de LIMA (UTC−5 fijo), no del servidor UTC: la medianoche local
    // empezaba «hoy» a las 19:00 de Lima de ayer.
    const DIA_MS = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(startOfLimaDay(now));
    const startOfWeek = new Date(startOfToday.getTime() - 6 * DIA_MS); // rolling 7 days
    const startOfYesterday = new Date(startOfToday.getTime() - DIA_MS);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Las 11 cuentas en UNA consulta (16-10, carril velocidad): con el pool de
    // 5 conexiones eran 3 tandas de idas (~120 ms cada una desde la PC de
    // Brandon). Subconsultas sueltas, no un FILTER sobre "Order": cada una usa
    // su índice. Fechas como texto `::timestamp` (columnas sin zona, en UTC).
    // Los estados son constantes del código, no entrada del usuario.
    const ts = (d: Date) => d.toISOString();
    const cuentasP = withDbRetry(() =>
      prisma.$queryRaw<FilaCuentas[]>`
        SELECT
          (SELECT count(*) FROM "Order" WHERE "tenantId" = ${tenantId} AND status = 'pendiente')::int AS "pendingOrders",
          (SELECT count(*) FROM "Order" WHERE "tenantId" = ${tenantId} AND status = 'pendiente'
             AND "createdAt" < ${ts(thirtyMinutesAgo)}::timestamp)::int AS "oldPendingOrders",
          (SELECT count(*) FROM "Order" WHERE "tenantId" = ${tenantId}
             AND "createdAt" >= ${ts(startOfToday)}::timestamp)::int AS "todayOrders",
          (SELECT COALESCE(sum(total), 0) FROM "Order" WHERE "tenantId" = ${tenantId} AND status = 'entregado'
             AND "createdAt" >= ${ts(startOfToday)}::timestamp)::float8 AS "todayRevenue",
          (SELECT COALESCE(sum(total), 0) FROM "Order" WHERE "tenantId" = ${tenantId} AND status = 'entregado'
             AND "createdAt" >= ${ts(startOfYesterday)}::timestamp
             AND "createdAt" < ${ts(startOfToday)}::timestamp)::float8 AS "salesYesterday",
          (SELECT count(*) FROM "Order" WHERE "tenantId" = ${tenantId}
             AND "createdAt" >= ${ts(startOfWeek)}::timestamp)::int AS "weekOrders",
          (SELECT count(*) FROM "Customer" WHERE "tenantId" = ${tenantId})::int AS "totalCustomers",
          (SELECT count(*) FROM "Payable" WHERE "tenantId" = ${tenantId}
             AND "dueDate" < ${ts(now)}::timestamp AND status <> 'pagado')::int AS "overduePayables",
          (SELECT count(*) FROM "Fiado" WHERE "tenantId" = ${tenantId} AND status IN ('ACTIVO', 'VENCIDO')
             AND saldo > 0 AND "fechaVence" < ${ts(now)}::timestamp)::int AS "overdueFiados",
          (SELECT count(*) FROM "Order" WHERE "tenantId" = ${tenantId} AND status = 'pendiente'
             AND "paymentMethod" = 'yape')::int AS "pendingYape",
          (SELECT count(*) FROM "WhatsAppMessage" WHERE "tenantId" = ${tenantId}
             AND direction = 'in' AND "read" = false)::int AS "waUnread"
      `
    );

    // Productos bajo stock minimo: comparacion columna-columna (raw SQL
    // parametrizado). Un solo stock mínimo (09-10): el propio o
    // `Settings.globalMinStock`, sin borrados, como Inicio e Inventario. Corre
    // EN PARALELO con las cuentas (el mínimo sale de Settings, cacheado).
    const stockBajoP = minimoGlobalDelNegocio(tenantId).then((minimoGlobal) =>
      withDbRetry(() =>
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "Product"
          WHERE "tenantId" = ${tenantId}
            AND "active" = true
            AND "deletedAt" IS NULL
            AND "stock" IS NOT NULL
            AND "stock" <= COALESCE("stockMin", ${minimoGlobal}::int)
        `
      )
    );

    const [cuentas, lowStockResult] = await Promise.all([cuentasP, stockBajoP]);
    const c: FilaCuentas = cuentas[0] ?? CUENTAS_EN_CERO;
    const lowStockProducts = Number(lowStockResult[0]?.count ?? 0);
    const plata = (n: number | string | null) => Number(Number(n ?? 0).toFixed(2));

    return {
      pendingOrders: Number(c.pendingOrders),
      oldPendingOrders: Number(c.oldPendingOrders),
      todayOrders: Number(c.todayOrders),
      todayRevenue: plata(c.todayRevenue),
      salesYesterday: plata(c.salesYesterday),
      lowStockProducts,
      weekOrders: Number(c.weekOrders),
      totalCustomers: Number(c.totalCustomers),
      overduePayables: Number(c.overduePayables),
      overdueFiados: Number(c.overdueFiados),
      pendingYape: Number(c.pendingYape),
      waUnread: Number(c.waUnread),
      generatedAt: now.toISOString(),
    };
  },
};
