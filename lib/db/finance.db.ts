import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
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

// perf audit P1: invalidación de caché tras writes. `revalidateTag` lanza si se
// llama fuera de un contexto de request de Next (ej. unit tests que invocan la
// db class directo) — lo envolvemos: la invalidación es fire-and-forget, no
// crítica para la operación.
function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* fuera de contexto de request (test/script) — no crítico */
  }
}

// Tras escribir un gasto hay que invalidar su caché Y la del flujo de caja (los
// gastos alimentan cash-flow). Antes no se invalidaba nada → resumen viejo 30-60s.
function revalidateExpenses(tenantId: string): void {
  safeRevalidate(`tenant:${tenantId}:expenses`);
  safeRevalidate(`tenant:${tenantId}:cash-flow`);
}

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
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.payable.findMany({ where, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async getById(tenantId: string, id: string): Promise<DbPayable | null> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
    const row = await prisma.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
    return row ? mapPayable(row) : null;
  },
  async getBySupplierId(tenantId: string, supplierId: string): Promise<DbPayable[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:payables`);
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
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras write
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
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras write
    return mapPayable(row);
  },
  async addPayment(tenantId: string, id: string, payment: DbPayment): Promise<DbPayable | null> {
    // F2: race lock — todo dentro de $transaction para evitar doble pago concurrente
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
      if (!current) return null;

      const currentAmountNum = toNumOrZero(current.amount);
      const currentPaidNum = toNumOrZero(current.paidAmount);
      const sumPaid = currentPaidNum + payment.amount;

      // TD-018: tolerancia 0.01 para diferencias de punto flotante / redondeo
      if (sumPaid > currentAmountNum + 0.01) {
        throw new Error("Pago excede el saldo pendiente");
      }

      await tx.payment.create({
        data: { id: payment.id, payableId: id, amount: payment.amount, method: payment.method, date: new Date(payment.date), reference: payment.reference },
      });

      const status = sumPaid >= currentAmountNum ? "pagado" : sumPaid > 0 ? "parcial" : "pendiente";
      // Audit 2026-05-17 B-P0-3: updateMany con tenantId (defense-in-depth).
      // Antes `update({ where: { id } })` sin tenantId. El guard previo via
      // `findFirst({ id, tenantId })` cubre HOY, pero si alguien refactoriza
      // y quita el findFirst hay cross-tenant write. updateMany scoped
      // garantiza DB-level que solo el row del tenant correcto se actualice.
      await tx.payable.updateMany({
        where: { id, tenantId },
        data: { paidAmount: sumPaid, status },
      });

      const row = await tx.payable.findFirst({ where: { id, tenantId }, include: { payments: true } });
      if (!row) return null;
      return mapPayable(row);
    });
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras pago
    return result;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.payable.deleteMany({ where: { id, tenantId } }).catch((err) => logger.warn("[finance.db] payable delete failed", { id, tenantId, err: String(err) }));
    safeRevalidate(`tenant:${tenantId}:payables`); // perf audit P1: invalidar caché tras delete
  },
};

// ── Expenses DB ───────────────────────────────────────────────────────────────

export const ExpensesDB = {
  async getAll(tenantId: string, filters?: { recurring?: boolean; category?: string }): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    const where: Record<string, unknown> = { tenantId };
    if (filters?.recurring !== undefined) where.recurring = filters.recurring;
    if (filters?.category) where.category = filters.category;
    return (await prisma.expense.findMany({ where, orderBy: { date: "desc" } })).map(mapExpense);
  },
  async getByDateRange(tenantId: string, from: Date, to: Date): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    return (await prisma.expense.findMany({ where: { tenantId, date: { gte: from, lte: to } }, orderBy: { date: "desc" } })).map(mapExpense);
  },
  /**
   * Templates de gastos recurrentes — catálogo del "Punto de Compra".
   * Audit 2026-05-17 (feature compras): los Expense con recurring=true
   * actúan como plantillas en el catálogo. Click → crea Expense nuevo
   * con recurring=false (gasto real ejecutado).
   */
  async getRecurringTemplates(tenantId: string): Promise<DbExpense[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    return (await prisma.expense.findMany({
      where: { tenantId, recurring: true },
      orderBy: [{ category: "asc" }, { description: "asc" }],
    })).map(mapExpense);
  },
  /**
   * Crea un gasto a partir de un template recurring. El template queda
   * intacto (sigue recurring=true); el nuevo gasto es no-recurring
   * (transacción real). Permite override de amount/description/date.
   */
  async addFromTemplate(
    tenantId: string,
    templateId: string,
    overrides?: { amount?: number; description?: string; date?: string },
  ): Promise<DbExpense | null> {
    const tpl = await prisma.expense.findFirst({
      where: { id: templateId, tenantId, recurring: true },
    });
    if (!tpl) return null;
    const row = await prisma.expense.create({
      data: {
        tenantId,
        category: tpl.category,
        description: overrides?.description ?? tpl.description,
        amount: overrides?.amount ?? toNumOrZero(tpl.amount),
        date: overrides?.date ? new Date(overrides.date) : new Date(),
        recurring: false,
      },
    });
    revalidateExpenses(tenantId);
    return mapExpense(row);
  },
  async add(tenantId: string, data: Omit<DbExpense, "id" | "createdAt">): Promise<DbExpense> {
    const row = await prisma.expense.create({ data: { category: data.category, description: data.description, amount: data.amount, date: new Date(data.date), recurring: data.recurring, tenantId } });
    revalidateExpenses(tenantId);
    return mapExpense(row);
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.expense.deleteMany({ where: { id, tenantId } }).catch((err) => logger.warn("[finance.db] expense delete failed", { id, tenantId, err: String(err) }));
    revalidateExpenses(tenantId);
  },
  async getSummary(tenantId: string): Promise<{ category: string; total: number; count: number }[]> {
    "use cache";
    cacheLife({ revalidate: 30, stale: 60 });
    cacheTag(`tenant:${tenantId}:expenses`);
    const groups = await prisma.expense.groupBy({ by: ["category"], where: { tenantId }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } });
    // TD-018: g._sum.amount es Decimal | null
    return groups.map(g => ({ category: g.category, total: toNumOrZero(g._sum.amount), count: g._count }));
  },
  /**
   * Historial de gastos agregado de TODOS los módulos:
   *  - Expense table (gastos manuales)
   *  - PurchaseOrder con status "recibido" (compras a proveedores)
   * Audit 2026-05-17 (feature compras): vista unificada por mes.
   */
  async getHistorialUnificado(
    tenantId: string,
    filters: { from?: Date; to?: Date; source?: "expense" | "purchase" | "all" },
  ): Promise<Array<{
    id: string;
    source: "expense" | "purchase";
    fecha: string;
    category: string;
    description: string;
    amount: number;
    recurring: boolean;
    supplierName?: string;
  }>> {
    const source = filters.source ?? "all";
    const dateFilter: Record<string, Date> = {};
    if (filters.from) dateFilter.gte = filters.from;
    if (filters.to) dateFilter.lte = filters.to;

    const needExpenses = source === "all" || source === "expense";
    const needPurchases = source === "all" || source === "purchase";

    const [expenses, purchases] = await Promise.all([
      needExpenses
        ? prisma.expense.findMany({
            where: {
              tenantId,
              recurring: false, // templates no cuentan como gastos ejecutados
              ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
            },
            orderBy: { date: "desc" },
          })
        : Promise.resolve([]),
      needPurchases
        ? prisma.purchaseOrder.findMany({
            where: {
              tenantId,
              // Audit 2026-05-17: solo OCs concretadas. Enum PurchaseStatus es
              // (pendiente|recibido|parcial|cancelado|auto_generated). "recibido"
              // y "parcial" cuentan como gasto real (algo de mercadería entró).
              status: { in: ["recibido", "parcial"] },
              ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
            },
            select: {
              id: true, total: true, supplierName: true, status: true,
              notes: true, createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const items = [
      ...expenses.map((e) => ({
        id: `exp-${e.id}`,
        source: "expense" as const,
        fecha: e.date.toISOString(),
        category: e.category,
        description: e.description ?? "",
        amount: toNumOrZero(e.amount),
        recurring: e.recurring,
      })),
      ...purchases.map((p) => ({
        id: `oc-${p.id}`,
        source: "purchase" as const,
        fecha: p.createdAt.toISOString(),
        category: "Compras a proveedor",
        description: p.notes ?? `OC ${p.id.slice(-6)}`,
        amount: toNumOrZero(p.total),
        recurring: false,
        supplierName: p.supplierName,
      })),
    ];

    return items.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
  },
};
