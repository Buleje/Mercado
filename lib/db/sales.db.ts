import "server-only";
import { prisma } from "@/lib/prisma";
// TD-116 (2026-06-10): lecturas de Sale envueltas en withRlsTx (ver orders.db).
import { withRlsTx } from "@/lib/prisma-rls";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
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
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { contarVentas, cuentaEfectivoCaja, type CuentaCaja } from "@/lib/caja/efectivo-esperado";
import { CajaNoAbiertaError, CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";
import { liquidacionDelMovimiento, medioCorregible, type PagoDeLiquidacion } from "@/lib/caja/cambiar-medio";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";

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
  /**
   * Sólo en los ingresos/egresos de una caja ABIERTA que son el pago de una
   * liquidación: su código. La pantalla no ofrece «Cambiar medio» ahí (criterio
   * de `lib/caja/cambiar-medio`, el mismo del 409 del servidor).
   */
  liquidacionCodigo?: string;
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
  /**
   * Sólo en cajas ABIERTAS: el efectivo que debería haber ahora, con la fórmula
   * del cierre sobre TODOS sus movimientos (no sobre los 100 que trae el
   * include). `expectedAmount` sigue siendo el que se congeló al cerrar.
   */
  efectivoEsperado?: number;
};

/** Lo que el aviso del panel necesita de la caja abierta más vieja. */
export interface CajaAbiertaResumen {
  id: string;
  openedAt: string;
  ventas: number;
  cuenta: CuentaCaja;
}

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
    invalidarVentasOverview(tenantId);
    return mapSale(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await withRlsTx(tenantId, (tx) => tx.sale.deleteMany({ where: { id, tenantId } })).catch((err) => logger.error("[sales.db] sale delete failed", { error: String(err), id, tenantId }));
    invalidarVentasOverview(tenantId);
  },
};

// ── Cash Registers DB ─────────────────────────────────────────────────────────

/**
 * La cuenta de efectivo de UNA caja, sumada en la base (groupBy por tipo y
 * método) en vez de traer sus movimientos: una caja abierta meses puede tener
 * miles, y el include de getAll corta en 100. CashMovement no tiene tenantId
 * propio: el aislamiento va por la relación, en el WHERE.
 */
async function sumarCaja(tenantId: string, cashRegisterId: string, apertura: number): Promise<CuentaCaja> {
  const grupos = await prisma.cashMovement.groupBy({
    by: ["type", "method"],
    where: { cashRegisterId, cashRegister: { tenantId } },
    _sum: { amount: true },
  });
  return cuentaEfectivoCaja(
    apertura,
    grupos.map((g) => ({ type: g.type, method: g.method, amount: toNumOrZero(g._sum.amount) })),
  );
}

/** Ventas distintas de una caja (un pago mixto son varias líneas con el mismo saleId). */
async function contarVentasDeCaja(tenantId: string, cashRegisterId: string): Promise<number> {
  const grupos = await prisma.cashMovement.groupBy({
    by: ["saleId"],
    where: { cashRegisterId, cashRegister: { tenantId }, type: "venta" },
    _count: { _all: true },
  });
  return contarVentas(grupos.map((g) => ({ saleId: g.saleId, movimientos: g._count._all })));
}

/** Le pone a cada caja ABIERTA el efectivo que debería tener ahora. */
async function conEfectivoEsperado(tenantId: string, cajas: DbCashRegister[]): Promise<DbCashRegister[]> {
  const abiertas = cajas.filter((c) => c.status === "abierta" && !c.closedAt);
  if (abiertas.length === 0) return cajas;
  const esperados = new Map(
    await Promise.all(
      abiertas.map(async (c) => [c.id, (await sumarCaja(tenantId, c.id, c.openingAmount)).esperado] as const),
    ),
  );
  const liquidaciones = await liquidacionesDeLasAbiertas(tenantId, abiertas);
  return cajas.map((c) => {
    if (!esperados.has(c.id)) return c;
    return {
      ...c,
      efectivoEsperado: esperados.get(c.id),
      movements: c.movements.map((m) => {
        const codigo = medioCorregible(m.type) ? liquidacionDelMovimiento(m.id, liquidaciones) : null;
        return codigo ? { ...m, liquidacionCodigo: codigo } : m;
      }),
    };
  });
}

/**
 * Las liquidaciones cuyo pago está entre los ingresos/egresos de las cajas
 * abiertas. Si la lectura falla, la pantalla sigue (ofrece el selector y el
 * servidor rechaza con su 409): perder este dato no debe tumbar la caja.
 */
async function liquidacionesDeLasAbiertas(tenantId: string, abiertas: DbCashRegister[]): Promise<PagoDeLiquidacion[]> {
  const ids = abiertas.flatMap((c) => c.movements.filter((m) => medioCorregible(m.type)).map((m) => m.id));
  try {
    return await CashRegistersMovementsDB.liquidacionesDeMovimientos(tenantId, ids);
  } catch (err) {
    logger.warn("[sales.db] no se pudo leer qué movimientos son de una liquidación", { error: String(err), tenantId });
    return [];
  }
}

export const CashRegistersDB = {
  async getAll(tenantId: string): Promise<DbCashRegister[]> {
    const where: Record<string, unknown> = { tenantId };
    // Round 28 P1 (DB profundo audit): movements include sin take traía 10k+
    // movimientos de cajas con 6 meses de operación → ~50-200 MB en memoria
    // por tenant activo, OOM potencial en Vercel Fluid Compute (512 MB).
    // Frontend usa los movimientos recientes para mostrar últimas operaciones;
    // historial completo debe ir por endpoint paginado dedicado.
    const cajas = (await prisma.cashRegister.findMany({ where, include: { movements: { orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { openedAt: "desc" } })).map(mapCashRegister);
    return conEfectivoEsperado(tenantId, cajas);
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
    return {
      items: await conEfectivoEsperado(tenantId, items.map(mapCashRegister)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  },
  /**
   * La caja abierta MÁS VIEJA con su cuenta (ventas + efectivo esperado), para
   * el aviso del panel: «abierta hace 111 días · 3 ventas · S/ 245.00». `null`
   * si no hay caja abierta.
   */
  async cuentaCajaAbierta(tenantId: string): Promise<CajaAbiertaResumen | null> {
    const caja = await prisma.cashRegister.findFirst({
      where: { tenantId, status: "abierta", closedAt: null },
      orderBy: { openedAt: "asc" },
      select: { id: true, openedAt: true, openingAmount: true },
    });
    if (!caja) return null;
    const [cuenta, ventas] = await Promise.all([
      sumarCaja(tenantId, caja.id, toNumOrZero(caja.openingAmount)),
      contarVentasDeCaja(tenantId, caja.id),
    ]);
    return { id: caja.id, openedAt: toISO(caja.openedAt), ventas, cuenta };
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
    // El banner avisa de cajas abiertas desde un día anterior (AlertsDB, cache 60 s).
    invalidate(`admin:alerts-summary:${tenantId}`);
    invalidarVentasOverview(tenantId);
    return mapCashRegister(row);
  },
  async close(tenantId: string, id: string, closingAmount: number, notes?: string): Promise<DbCashRegister | null> {
    // Y4 FIX 2026-05-07: updateMany + cashMovement.create ahora en la MISMA
    // $transaction. Antes si el proceso moría entre ambas llamadas la caja
    // quedaba cerrada sin movimiento de cierre, rompiendo el cuadre contable.
    // El optimistic lock (closedAt: null) se mantiene para detección de doble-cierre.
    const row = await prisma.$transaction(async (tx) => {
      /* F4 (3ª pasada de seguridad de ADR-448): la caja, bloqueada en exclusiva
         ANTES de leer. Sin esto, un adelanto o una liquidación que anotaba su
         movimiento en este instante quedaba fuera del esperado (o entraba en la
         caja ya cerrada): arqueo descuadrado por el monto exacto. Con el lock,
         el que está anotando termina primero y se cuenta; el que llega después
         ve la caja cerrada (`moverCajaEnTx` → `sinCaja`). Es el ÚNICO lock del
         cierre: no bloquea nada más, así que no puede cerrar un ciclo. */
      if (!(await CashRegistersMovementsDB.bloquearCajaParaCerrarEnTx(tx, tenantId, id))) return null;
      // Releer BAJO el lock: en READ COMMITTED esta sentencia ya ve lo que
      // confirmó quien tenía la caja mientras esperábamos.
      const reg = await tx.cashRegister.findFirst({
        where: { id, tenantId },
        include: { movements: true },
      });
      if (!reg || reg.closedAt) return null;

      /* LA misma cuenta que el Resumen de Mi Plata (`saldoEsperadoDeCaja`): el
         arqueo cuenta sólo el efectivo; Yape/transferencia van aparte. */
      const expectedAmount = saldoEsperadoDeCaja(
        toNumOrZero(reg.openingAmount),
        reg.movements.map((m) => ({ type: m.type, method: m.method, amount: toNumOrZero(m.amount) })),
      ).esperado;
      const difference = Math.round((closingAmount - expectedAmount) * 100) / 100;

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
      /* Puede esperar a que termine de confirmarse un adelanto o una liquidación
         que está anotando en esta caja: margen sobre los 5 s por defecto. */
    }, { timeout: 15_000, maxWait: 5_000 });

    if (row) {
      invalidate(`admin:alerts-summary:${tenantId}`);
      invalidarVentasOverview(tenantId);
    }
    return row ? mapCashRegister(row) : null;
  },
  async addMovement(cashRegisterId: string, movement: { type: string; amount: number; method: string; description: string; saleId?: string }, tenantId: string): Promise<DbCashMovement> {
    // SECURITY 2026-05-06 (audit pagos H003 defense-in-depth): validar
    // ownership de la caja antes de crear el movement. Desde F4 el `tenantId`
    // es OBLIGATORIO (antes era opcional y tres de los cuatro llamadores no lo
    // mandaban). Queda 3er parámetro para no mover a los llamadores existentes.
    /* F4 (3ª pasada de seguridad de ADR-448): la caja, tomada en `FOR SHARE`
       en la MISMA transacción que el INSERT, con el tenant en el WHERE cuando
       llega. Antes una venta del POS, un arqueo o un ingreso del asistente que
       llegaba durante el cierre esperaba la FK y entraba en la caja YA cerrada.
       Ahora espera al cierre, relee el estado y no anota (`CajaNoAbiertaError`).
       La caja es el último lock de esta transacción (orden global en
       `lib/adelantos/movimiento-caja.ts`). */
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.$transaction(async (tx) => {
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, cashRegisterId);
      if (!caja) throw new Error("[cash-registers.addMovement] caja no pertenece al tenant");
      if (caja.status !== "abierta") throw new CajaNoAbiertaError();
      return tx.cashMovement.create({ data: { cashRegisterId, ...movement } });
    });
    invalidarVentasOverview(tenantId);
    return mapCashMovement(row);
  },
};
