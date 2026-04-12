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
import { toNumOrZero } from "@/lib/decimal-utils";

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
    description: p.description, amount: toNumOrZero(p.amount), paidAmount: toNumOrZero(p.paidAmount),
    status: p.status as DbPayable["status"],
    dueDate: toISO(p.dueDate),
    payments: p.payments.map((pm: PPayment) => ({
      id: pm.id, amount: toNumOrZero(pm.amount), method: pm.method as PaymentMethod,
      date: toISO(pm.date),
      ...(pm.reference != null && { reference: pm.reference }),
    })),
    createdAt: toISO(p.createdAt),
  };
}

function mapExpense(e: PExpense): DbExpense {
  return { id: e.id, category: e.category, description: e.description, amount: toNumOrZero(e.amount), date: toISO(e.date), recurring: e.recurring, createdAt: toISO(e.createdAt) };
}

// ── Payables DB ───────────────────────────────────────────────────────────────

export const PayablesDB = {
  async getAll(tenantId: string): Promise<DbPayable[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.payable.findMany({ where, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async getById(tenantId: string, id: string): Promise<DbPayable | null> {
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    return row ? mapPayable(row) : null;
  },
  async getBySupplierId(tenantId: string, supplierId: string): Promise<DbPayable[]> {
    return (await prisma.payable.findMany({ where: { supplierId, tenantId }, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async add(tenantId: string, p: DbPayable): Promise<DbPayable> {
    const row = await prisma.payable.create({
      data: {
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId, description: p.description,
        amount: p.amount, paidAmount: p.paidAmount, status: p.status,
        dueDate: new Date(p.dueDate), tenantId,
      },
      include: { payments: true },
    });
    return mapPayable(row);
  },
  async update(tenantId: string, id: string, patch: Partial<DbPayable>): Promise<DbPayable | null> {
    const existing = await prisma.payable.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.dueDate !== undefined) data.dueDate = new Date(patch.dueDate);
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    await prisma.payable.updateMany({ where: { id, tenantId }, data });
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    if (!row) return null;
    return mapPayable(row);
  },
  async addPayment(tenantId: string, id: string, payment: DbPayment): Promise<DbPayable | null> {
    const existing = await prisma.payable.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.payment.create({
      data: { id: payment.id, payableId: id, amount: payment.amount, method: payment.method, date: new Date(payment.date), reference: payment.reference },
    });
    const allPay = await prisma.payment.findMany({ where: { payableId: id } });
    // TD-018: p.amount y existing.amount son Decimal
    const paidAmount = allPay.reduce((s: number, p: PPayment) => s + toNumOrZero(p.amount), 0);
    const existingAmountNum = toNumOrZero(existing.amount);
    const status = paidAmount >= existingAmountNum ? "pagado" : paidAmount > 0 ? "parcial" : "pendiente";
    await prisma.payable.updateMany({ where: { id, tenantId }, data: { paidAmount, status } });
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    if (!row) return null;
    return mapPayable(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.payable.deleteMany({ where: { id, tenantId } }).catch(() => {});
  },
};

// ── Expenses DB ───────────────────────────────────────────────────────────────

export const ExpensesDB = {
  async getAll(tenantId: string): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ where: { tenantId }, orderBy: { date: "desc" } })).map(mapExpense);
  },
  async getByDateRange(tenantId: string, from: Date, to: Date): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ where: { tenantId, date: { gte: from, lte: to } }, orderBy: { date: "desc" } })).map(mapExpense);
  },
  async add(tenantId: string, data: Omit<DbExpense, "id" | "createdAt">): Promise<DbExpense> {
    const row = await prisma.expense.create({ data: { category: data.category, description: data.description, amount: data.amount, date: new Date(data.date), recurring: data.recurring, tenantId } });
    return mapExpense(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.expense.deleteMany({ where: { id, tenantId } }).catch(() => {});
  },
  async getSummary(tenantId: string): Promise<{ category: string; total: number; count: number }[]> {
    const groups = await prisma.expense.groupBy({ by: ["category"], where: { tenantId }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } });
    // TD-018: g._sum.amount es Decimal | null
    return groups.map(g => ({ category: g.category, total: toNumOrZero(g._sum.amount), count: g._count }));
  },
};
