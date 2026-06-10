import "server-only";
import { prisma } from "@/lib/prisma";
// TD-116 (2026-06-10): lecturas de Sale envueltas en withRlsTx (ver orders.db).
import { withRlsTx } from "@/lib/prisma-rls";
import { logger } from "@/lib/logger";
import type {
  Sale as PSale,
  SaleItem as PSaleItem,
  CashRegister as PCashRegister,
  CashMovement as PCashMovement,
} from "@/lib/generated/prisma/client";
import {
  type DbSale,
} from "./misc.db";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Local Types ───────────────────────────────────────────────────────────────

export type CashRegisterStatus = "abierta" | "cerrada";

export type DbCashMovement = {
  id: string;
  cashRegisterId: string;
  type: string; // venta, ingreso, egreso, apertura, cierre
  amount: number;
  method: string;
  description: string;
  saleId?: string;
  createdAt: string;
};

export type DbCashRegister = {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: CashRegisterStatus;
  notes?: string;
  movements: DbCashMovement[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

// Tipo permisivo: acepta PSale completo o PSale sin idempotencyKey (drift).
function mapSale(s: Omit<PSale, "idempotencyKey"> & { items: PSaleItem[]; idempotencyKey?: string | null }): DbSale {
  return {
    id: s.id,
    items: s.items.map((i: PSaleItem) => ({ productId: i.productId, name: i.name, price: toNumOrZero(i.price), ...(i.costPrice != null && { costPrice: toNumOrZero(i.costPrice) }), quantity: i.quantity, unit: i.unit })),
    total: toNumOrZero(s.total), ...(s.totalCogs != null && { totalCogs: toNumOrZero(s.totalCogs) }), payment: s.payment as DbSale["payment"],
    amountPaid: toNumOrZero(s.amountPaid), change: toNumOrZero(s.change),
    ...(s.customerPhone != null && { customerPhone: s.customerPhone }),
    ...(s.cashierId != null && { cashierId: s.cashierId }),
    createdAt: toISO(s.createdAt),
    // Mejora 1 & 4: new fields
    ...(s.comprobanteTipo != null && { comprobanteTipo: s.comprobanteTipo }),
    ...(s.comprobanteRuc != null && { comprobanteRuc: s.comprobanteRuc }),
    ...(s.descuentoMonto != null && { descuentoMonto: Number(s.descuentoMonto) }),
    ...(s.descuentoPorcentaje != null && { descuentoPorcentaje: Number(s.descuentoPorcentaje) }),
    // Pago mixto / fiado
    ...(s.paymentDetails != null && { paymentDetails: s.paymentDetails }),
  };
}

function mapCashMovement(m: PCashMovement): DbCashMovement {
  return {
    id: m.id, cashRegisterId: m.cashRegisterId, type: m.type,
    amount: toNumOrZero(m.amount), method: m.method, description: m.description,
    ...(m.saleId != null && { saleId: m.saleId }),
    createdAt: toISO(m.createdAt),
  };
}

function mapCashRegister(r: PCashRegister & { movements: PCashMovement[] }): DbCashRegister {
  return {
    id: r.id, openedAt: toISO(r.openedAt),
    ...(r.closedAt != null && { closedAt: toISO(r.closedAt) }),
    openingAmount: toNumOrZero(r.openingAmount),
    ...(r.closingAmount != null && { closingAmount: toNumOrZero(r.closingAmount) }),
    ...(r.expectedAmount != null && { expectedAmount: toNumOrZero(r.expectedAmount) }),
    ...(r.difference != null && { difference: toNumOrZero(r.difference) }),
    status: r.status as CashRegisterStatus,
    ...(r.notes != null && { notes: r.notes }),
    movements: r.movements.map(mapCashMovement),
  };
}

// ── POS Sales DB ──────────────────────────────────────────────────────────────

export const SalesDB = {
  /**
   * Retorna SaleItems de los productIds dados, para el cálculo EOQ.
   * El guard multi-tenant va anidado en sale (SaleItem no tiene tenantId
   * propio — el filtro real es por la entidad padre Sale).
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async findSaleItemsByProducts(
    tenantId: string,
    productIds: (number | string)[],
    since: Date,
  ) {
    return withRlsTx(tenantId, (tx) => tx.saleItem.findMany({
      where: {
        productId: { in: productIds as number[] },
        sale: { tenantId, createdAt: { gte: since } },
      },
      select: { productId: true, quantity: true },
    }));
  },

  async getAll(tenantId: string): Promise<DbSale[]> {
    // FIX 2026-05-07 (schema drift): omit idempotencyKey hasta que la
    // migration 20260507000000_add_sale_idempotency_key se aplique a la DB.
    // Prisma intenta SELECT-ear todos los campos del schema; si la columna
    // no existe en Postgres, falla con 503 "column not available".
    // Quitar el omit cuando se haga `prisma migrate deploy` con DIRECT_URL.
    return (await withRlsTx(tenantId, (tx) => tx.sale.findMany({
      where: { tenantId },
      omit: { idempotencyKey: true },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    }))).map(mapSale);
  },
  /**
   * Offset pagination DB-side (skip/take + count en $transaction).
   *
   * Audit 2026-05-17 B-P0-4: el route handler antiguo hacía
   * `getAll() + sales.slice(start, start + limit)` — cargaba todas las
   * ventas del tenant en RAM antes de cortar. Para tenants con >10k ventas
   * eso es 30MB+ por request → OOM en Vercel Fluid 512MB.
   *
   * Soporta filtros: today, from, to, cashierId. Filtros aplicados Prisma-side.
   */
  async getAllFilteredPaginated(opts: {
    tenantId: string;
    page: number;
    limit: number;
    today?: boolean;
    from?: Date;
    to?: Date;
    cashierId?: string;
  }): Promise<{ items: DbSale[]; total: number }> {
    const where: Record<string, unknown> = { tenantId: opts.tenantId };

    const createdAt: Record<string, Date> = {};
    if (opts.today) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      createdAt.gte = startOfDay;
    }
    if (opts.from) createdAt.gte = opts.from;
    if (opts.to) createdAt.lte = opts.to;
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    if (opts.cashierId) where.cashierId = opts.cashierId;

    const skip = Math.max(0, (opts.page - 1) * opts.limit);

    // TD-116: batch-tx → Promise.all dentro de la tx RLS (ver orders.getPage)
    const [rows, total] = await withRlsTx(opts.tenantId, (tx) =>
      Promise.all([
        tx.sale.findMany({
          where,
          omit: { idempotencyKey: true },
          include: { items: true },
          orderBy: { createdAt: "desc" },
          skip,
          take: opts.limit,
        }),
        tx.sale.count({ where }),
      ]),
    );

    return { items: rows.map(mapSale), total };
  },

  async getById(tenantId: string, id: string): Promise<DbSale | null> {
    const row = await withRlsTx(tenantId, (tx) => tx.sale.findFirst({
      where: { id, tenantId },
      omit: { idempotencyKey: true },
      include: { items: true },
    }));
    return row ? mapSale(row) : null;
  },
  async add(tenantId: string, sale: DbSale): Promise<DbSale> {
    // Pre-validate product IDs to avoid FK violations (products may have been deleted since the sale was queued offline)
    // TD-116: validación de productos + create en UNA tx RLS (atómico).
    const requestedIds = [...new Set(sale.items.map(i => i.productId))];
    const row = await withRlsTx(tenantId, async (tx) => {
    const existingProducts = await tx.product.findMany({
      where: { id: { in: requestedIds }, tenantId },
      select: { id: true },
    });
    const validIds = new Set(existingProducts.map(p => p.id));
    const validItems = sale.items.filter(i => validIds.has(i.productId));

    return tx.sale.create({
      data: {
        tenantId,
        id: sale.id, total: sale.total, totalCogs: sale.totalCogs ?? null, payment: sale.payment,
        amountPaid: sale.amountPaid, change: sale.change, customerPhone: sale.customerPhone ?? null, cashierId: sale.cashierId ?? null,
        // Comprobante fields
        comprobanteTipo: sale.comprobanteTipo ?? "ticket",
        comprobanteRuc: sale.comprobanteRuc ?? null,
        // Descuento global fields
        descuentoMonto: sale.descuentoMonto ?? null,
        descuentoPorcentaje: sale.descuentoPorcentaje ?? null,
        // Pago mixto / fiado
        paymentDetails: sale.paymentDetails ?? null,
        items: validItems.length > 0
          ? { create: validItems.map((i) => ({ productId: i.productId, name: i.name, price: i.price, costPrice: i.costPrice ?? null, quantity: i.quantity, unit: i.unit ?? "" })) }
          : undefined,
      },
      include: { items: true },
    });
    });
    return mapSale(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await withRlsTx(tenantId, (tx) => tx.sale.deleteMany({ where: { id, tenantId } })).catch((err) => logger.error("[sales.db] sale delete failed", { error: String(err), id, tenantId }));
  },
};

// ── Cash Registers DB ─────────────────────────────────────────────────────────

export const CashRegistersDB = {
  async getAll(tenantId: string): Promise<DbCashRegister[]> {
    const where: Record<string, unknown> = { tenantId };
    // Round 28 P1 (DB profundo audit): movements include sin take traía 10k+
    // movimientos de cajas con 6 meses de operación → ~50-200 MB en memoria
    // por tenant activo, OOM potencial en Vercel Fluid Compute (512 MB).
    // Frontend usa los movimientos recientes para mostrar últimas operaciones;
    // historial completo debe ir por endpoint paginado dedicado.
    return (await prisma.cashRegister.findMany({ where, include: { movements: { orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { openedAt: "desc" } })).map(mapCashRegister);
  },
  async getAllPaginated(tenantId: string, limit = 25, cursor?: string): Promise<{ items: DbCashRegister[]; nextCursor: string | null }> {
    const rows = await prisma.cashRegister.findMany({
      where: { tenantId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      // Round 28 P1: idem getAll — limitar movements include a últimos 100.
      include: { movements: { orderBy: { createdAt: "desc" }, take: 100 } },
      orderBy: { openedAt: "desc" },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items: items.map(mapCashRegister), nextCursor: hasMore ? items[items.length - 1].id : null };
  },
  async getOpen(tenantId: string): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findFirst({ where: { tenantId, status: "abierta" }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async getById(tenantId: string, id: string): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findFirst({ where: { id, tenantId }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async open(tenantId: string, openingAmount: number, notes?: string): Promise<DbCashRegister> {
    const row = await prisma.cashRegister.create({
      data: {
        tenantId,
        openingAmount, notes,
        movements: { create: { type: "apertura", amount: openingAmount, method: "efectivo", description: "Apertura de caja" } },
      },
      include: { movements: { orderBy: { createdAt: "desc" } } },
    });
    return mapCashRegister(row);
  },
  async close(tenantId: string, id: string, closingAmount: number, notes?: string): Promise<DbCashRegister | null> {
    // Y4 FIX 2026-05-07: updateMany + cashMovement.create ahora en la MISMA
    // $transaction. Antes si el proceso moría entre ambas llamadas la caja
    // quedaba cerrada sin movimiento de cierre, rompiendo el cuadre contable.
    // El optimistic lock (closedAt: null) se mantiene para detección de doble-cierre.
    const row = await prisma.$transaction(async (tx) => {
      // Leer dentro de tx para calcular expectedAmount con datos consistentes
      const reg = await tx.cashRegister.findFirst({
        where: { id, tenantId },
        include: { movements: true },
      });
      if (!reg || reg.closedAt) return null;

      const totalSales = reg.movements.filter(m => m.type === "venta" && m.method === "efectivo").reduce((s, m) => s + toNumOrZero(m.amount), 0);
      const totalIn = reg.movements.filter(m => m.type === "ingreso").reduce((s, m) => s + toNumOrZero(m.amount), 0);
      const totalOut = reg.movements.filter(m => m.type === "egreso").reduce((s, m) => s + toNumOrZero(m.amount), 0);
      const expectedAmount = toNumOrZero(reg.openingAmount) + totalSales + totalIn - totalOut;
      const difference = closingAmount - expectedAmount;

      // Optimistic lock: solo actualiza si closedAt sigue siendo null
      const result = await tx.cashRegister.updateMany({
        where: { id, tenantId, closedAt: null },
        data: { status: "cerrada", closedAt: new Date(), closingAmount, expectedAmount, difference, notes },
      });

      if (result.count === 0) return null; // Otro request llegó primero

      // Movimiento de cierre en la MISMA tx: si falla, el update se revierte
      await tx.cashMovement.create({
        data: { cashRegisterId: id, type: "cierre", amount: closingAmount, method: "efectivo", description: "Cierre de caja" },
      });

      return tx.cashRegister.findUnique({
        where: { id },
        include: { movements: { orderBy: { createdAt: "desc" } } },
      });
    });

    return row ? mapCashRegister(row) : null;
  },
  async addMovement(cashRegisterId: string, movement: { type: string; amount: number; method: string; description: string; saleId?: string }, tenantId?: string): Promise<DbCashMovement> {
    // SECURITY 2026-05-06 (audit pagos H003 defense-in-depth): si llega
    // tenantId, validar ownership de la caja antes de crear el movement.
    // Caller actual (`app/api/cash-registers/[id]/route.ts`) ya valida
    // ownership con `assertRegisterOwnership`; este check es redundante
    // pero blinda contra futuros callers que olviden hacerlo.
    if (tenantId) {
      const reg = await prisma.cashRegister.findFirst({
        where: { id: cashRegisterId, tenantId },
        select: { id: true },
      });
      if (!reg) {
        throw new Error("[cash-registers.addMovement] caja no pertenece al tenant");
      }
    }
    const row = await prisma.cashMovement.create({
      data: { cashRegisterId, ...movement },
    });
    return mapCashMovement(row);
  },
};
