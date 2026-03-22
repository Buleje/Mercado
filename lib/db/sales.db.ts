import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  Sale as PSale,
  SaleItem as PSaleItem,
  CashRegister as PCashRegister,
  CashMovement as PCashMovement,
} from "@/lib/generated/prisma/client";
import {
  type DbSale,
} from "./misc.db";

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

function mapSale(s: PSale & { items: PSaleItem[] }): DbSale {
  return {
    id: s.id,
    items: s.items.map((i: PSaleItem) => ({ productId: i.productId, name: i.name, price: i.price, ...(i.costPrice != null && { costPrice: i.costPrice }), quantity: i.quantity, unit: i.unit })),
    total: s.total, ...(s.totalCogs != null && { totalCogs: s.totalCogs }), payment: s.payment as DbSale["payment"],
    amountPaid: s.amountPaid, change: s.change,
    ...(s.customerPhone != null && { customerPhone: s.customerPhone }),
    ...(s.cashierId != null && { cashierId: s.cashierId }),
    createdAt: toISO(s.createdAt),
  };
}

function mapCashMovement(m: PCashMovement): DbCashMovement {
  return {
    id: m.id, cashRegisterId: m.cashRegisterId, type: m.type,
    amount: m.amount, method: m.method, description: m.description,
    ...(m.saleId != null && { saleId: m.saleId }),
    createdAt: toISO(m.createdAt),
  };
}

function mapCashRegister(r: PCashRegister & { movements: PCashMovement[] }): DbCashRegister {
  return {
    id: r.id, openedAt: toISO(r.openedAt),
    ...(r.closedAt != null && { closedAt: toISO(r.closedAt) }),
    openingAmount: r.openingAmount,
    ...(r.closingAmount != null && { closingAmount: r.closingAmount }),
    ...(r.expectedAmount != null && { expectedAmount: r.expectedAmount }),
    ...(r.difference != null && { difference: r.difference }),
    status: r.status as CashRegisterStatus,
    ...(r.notes != null && { notes: r.notes }),
    movements: r.movements.map(mapCashMovement),
  };
}

// ── POS Sales DB ──────────────────────────────────────────────────────────────

export const SalesDB = {
  async getAll(): Promise<DbSale[]> {
    return (await prisma.sale.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapSale);
  },
  async getById(id: string): Promise<DbSale | null> {
    const row = await prisma.sale.findUnique({ where: { id }, include: { items: true } });
    return row ? mapSale(row) : null;
  },
  async add(sale: DbSale): Promise<DbSale> {
    const row = await prisma.sale.create({
      data: {
        id: sale.id, total: sale.total, totalCogs: sale.totalCogs ?? null, payment: sale.payment,
        amountPaid: sale.amountPaid, change: sale.change, customerPhone: sale.customerPhone, cashierId: sale.cashierId ?? null,
        items: { create: sale.items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, costPrice: i.costPrice ?? null, quantity: i.quantity, unit: i.unit })) },
      },
      include: { items: true },
    });
    return mapSale(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.sale.delete({ where: { id } }).catch(() => {});
  },
};

// ── Cash Registers DB ─────────────────────────────────────────────────────────

export const CashRegistersDB = {
  async getAll(): Promise<DbCashRegister[]> {
    return (await prisma.cashRegister.findMany({ include: { movements: { orderBy: { createdAt: "desc" } } }, orderBy: { openedAt: "desc" } })).map(mapCashRegister);
  },
  async getAllPaginated(limit = 25, cursor?: string): Promise<{ items: DbCashRegister[]; nextCursor: string | null }> {
    const rows = await prisma.cashRegister.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { movements: { orderBy: { createdAt: "desc" } } },
      orderBy: { openedAt: "desc" },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items: items.map(mapCashRegister), nextCursor: hasMore ? items[items.length - 1].id : null };
  },
  async getOpen(): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findFirst({ where: { status: "abierta" }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async getById(id: string): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async open(openingAmount: number, notes?: string): Promise<DbCashRegister> {
    const row = await prisma.cashRegister.create({
      data: {
        openingAmount, notes,
        movements: { create: { type: "apertura", amount: openingAmount, method: "efectivo", description: "Apertura de caja" } },
      },
      include: { movements: { orderBy: { createdAt: "desc" } } },
    });
    return mapCashRegister(row);
  },
  async close(id: string, closingAmount: number, notes?: string): Promise<DbCashRegister | null> {
    const reg = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } });
    if (!reg || reg.closedAt) return null;

    const totalSales = reg.movements.filter(m => m.type === "venta" && m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
    const totalIn = reg.movements.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
    const totalOut = reg.movements.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
    const expectedAmount = reg.openingAmount + totalSales + totalIn - totalOut;
    const difference = closingAmount - expectedAmount;

    // Optimistic lock: only update if closedAt is still null
    const result = await prisma.cashRegister.updateMany({
      where: { id, closedAt: null },
      data: { status: "cerrada", closedAt: new Date(), closingAmount, expectedAmount, difference, notes },
    });

    if (result.count === 0) return null; // Another request arrived first

    await prisma.cashMovement.create({
      data: { cashRegisterId: id, type: "cierre", amount: closingAmount, method: "efectivo", description: "Cierre de caja" },
    });

    const row = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async addMovement(cashRegisterId: string, movement: { type: string; amount: number; method: string; description: string; saleId?: string }): Promise<DbCashMovement> {
    const row = await prisma.cashMovement.create({
      data: { cashRegisterId, ...movement },
    });
    return mapCashMovement(row);
  },
};
