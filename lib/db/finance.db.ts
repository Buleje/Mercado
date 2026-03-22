import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  Payable as PPayable,
  Payment as PPayment,
  Expense as PExpense,
} from "@/lib/generated/prisma/client";
import {
  type DbPayable,
  type DbPayment,
  type PaymentMethod,
} from "./misc.db";

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPayable(p: PPayable & { payments: PPayment[] }): DbPayable {
  return {
    id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
    ...(p.purchaseOrderId != null && { purchaseOrderId: p.purchaseOrderId }),
    description: p.description, amount: p.amount, paidAmount: p.paidAmount,
    status: p.status as DbPayable["status"],
    dueDate: toISO(p.dueDate),
    payments: p.payments.map((pm: PPayment) => ({
      id: pm.id, amount: pm.amount, method: pm.method as PaymentMethod,
      date: toISO(pm.date),
      ...(pm.reference != null && { reference: pm.reference }),
    })),
    createdAt: toISO(p.createdAt),
  };
}

function mapExpense(e: PExpense): DbExpense {
  return { id: e.id, category: e.category, description: e.description, amount: e.amount, date: toISO(e.date), recurring: e.recurring, createdAt: toISO(e.createdAt) };
}

// ── Payables DB ───────────────────────────────────────────────────────────────

export const PayablesDB = {
  async getAll(): Promise<DbPayable[]> {
    return (await prisma.payable.findMany({ include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async getById(id: string): Promise<DbPayable | null> {
    const row = await prisma.payable.findUnique({ where: { id }, include: { payments: true } });
    return row ? mapPayable(row) : null;
  },
  async getBySupplierId(supplierId: string): Promise<DbPayable[]> {
    return (await prisma.payable.findMany({ where: { supplierId }, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async add(p: DbPayable): Promise<DbPayable> {
    const row = await prisma.payable.create({
      data: {
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId, description: p.description,
        amount: p.amount, paidAmount: p.paidAmount, status: p.status,
        dueDate: new Date(p.dueDate),
      },
      include: { payments: true },
    });
    return mapPayable(row);
  },
  async update(id: string, patch: Partial<DbPayable>): Promise<DbPayable | null> {
    const existing = await prisma.payable.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.dueDate !== undefined) data.dueDate = new Date(patch.dueDate);
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    const row = await prisma.payable.update({ where: { id }, data, include: { payments: true } });
    return mapPayable(row);
  },
  async addPayment(id: string, payment: DbPayment): Promise<DbPayable | null> {
    const existing = await prisma.payable.findUnique({ where: { id }, include: { payments: true } });
    if (!existing) return null;
    await prisma.payment.create({
      data: { id: payment.id, payableId: id, amount: payment.amount, method: payment.method, date: new Date(payment.date), reference: payment.reference },
    });
    const allPay = await prisma.payment.findMany({ where: { payableId: id } });
    const paidAmount = allPay.reduce((s: number, p: PPayment) => s + p.amount, 0);
    const status = paidAmount >= existing.amount ? "pagado" : paidAmount > 0 ? "parcial" : "pendiente";
    const row = await prisma.payable.update({ where: { id }, data: { paidAmount, status }, include: { payments: true } });
    return mapPayable(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.payable.delete({ where: { id } }).catch(() => {});
  },
};

// ── Expenses DB ───────────────────────────────────────────────────────────────

export const ExpensesDB = {
  async getAll(): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ orderBy: { date: "desc" } })).map(mapExpense);
  },
  async getByDateRange(from: Date, to: Date): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "desc" } })).map(mapExpense);
  },
  async add(data: Omit<DbExpense, "id" | "createdAt">): Promise<DbExpense> {
    const row = await prisma.expense.create({ data: { category: data.category, description: data.description, amount: data.amount, date: new Date(data.date), recurring: data.recurring } });
    return mapExpense(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } }).catch(() => {});
  },
  async getSummary(): Promise<{ category: string; total: number; count: number }[]> {
    const groups = await prisma.expense.groupBy({ by: ["category"], _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } });
    return groups.map(g => ({ category: g.category, total: g._sum.amount ?? 0, count: g._count }));
  },
};
