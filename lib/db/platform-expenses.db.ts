import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * PlatformExpensesDB — gastos REALES de plataforma (Buleje SaaS), distinto de
 * ExpensesDB (gastos por-tenant). Global, sin tenantId. Lo usa /superadmin/gastos
 * para responder "¿en qué gasta la plataforma?" y comparar contra el costo de
 * infra ESTIMADO (lib/cost-tracking). Brandon 2026-06-30.
 */

// Tipo de cambio aprox para normalizar KPIs (muchas facturas son en USD:
// Vercel, Supabase, Anthropic). Solo para agregados; el monto original se preserva.
const USD_TO_PEN = 3.75;

export const EXPENSE_CATEGORIES = [
  "infra",
  "mensajeria",
  "ia",
  "pagos",
  "personal",
  "marketing",
  "otros",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface PlatformExpenseRow {
  id: string;
  concept: string;
  category: string;
  amount: number; // en su moneda original
  currency: string; // PEN | USD
  amountPen: number; // normalizado a PEN para agregar
  date: string; // ISO
  recurring: boolean;
  period: string; // mensual | anual | ""
  vendor: string;
  notes: string;
}

export interface PlatformExpenseSummary {
  count: number;
  recurringCount: number;
  monthlyRunRatePen: number; // recurrentes normalizados a mes + únicos de este mes
  recurringMonthlyPen: number; // solo recurrentes, normalizado a mes
  thisMonthOneTimePen: number; // gastos únicos con fecha en el mes actual
  byCategory: { category: string; amountPen: number }[]; // run-rate mensual por categoría
}

function toPen(amount: number, currency: string): number {
  return currency === "USD" ? Math.round(amount * USD_TO_PEN * 100) / 100 : amount;
}

/** Normaliza un gasto recurrente a su costo MENSUAL (anual → /12). */
function monthlyize(amountPen: number, period: string): number {
  if (period === "anual") return Math.round((amountPen / 12) * 100) / 100;
  return amountPen; // mensual o vacío = se asume mensual
}

function mapRow(r: {
  id: string;
  concept: string;
  category: string;
  amount: Parameters<typeof toNumOrZero>[0];
  currency: string;
  date: Date;
  recurring: boolean;
  period: string;
  vendor: string;
  notes: string;
}): PlatformExpenseRow {
  const amount = toNumOrZero(r.amount);
  return {
    id: r.id,
    concept: r.concept,
    category: r.category,
    amount,
    currency: r.currency,
    amountPen: toPen(amount, r.currency),
    date: r.date.toISOString(),
    recurring: r.recurring,
    period: r.period,
    vendor: r.vendor,
    notes: r.notes,
  };
}

export const PlatformExpensesDB = {
  async list(): Promise<PlatformExpenseRow[]> {
    const rows = await prisma.platformExpense.findMany({ orderBy: { date: "desc" } });
    return rows.map(mapRow);
  },

  async summary(): Promise<PlatformExpenseSummary> {
    const rows = await this.list();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const catMap = new Map<string, number>();
    let recurringMonthlyPen = 0;
    let thisMonthOneTimePen = 0;
    let recurringCount = 0;

    for (const r of rows) {
      let monthlyPen = 0;
      if (r.recurring) {
        recurringCount += 1;
        monthlyPen = monthlyize(r.amountPen, r.period);
        recurringMonthlyPen += monthlyPen;
      } else if (new Date(r.date) >= monthStart) {
        monthlyPen = r.amountPen;
        thisMonthOneTimePen += monthlyPen;
      }
      if (monthlyPen > 0) {
        catMap.set(r.category, (catMap.get(r.category) ?? 0) + monthlyPen);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      count: rows.length,
      recurringCount,
      monthlyRunRatePen: round(recurringMonthlyPen + thisMonthOneTimePen),
      recurringMonthlyPen: round(recurringMonthlyPen),
      thisMonthOneTimePen: round(thisMonthOneTimePen),
      byCategory: Array.from(catMap.entries())
        .map(([category, amountPen]) => ({ category, amountPen: round(amountPen) }))
        .sort((a, b) => b.amountPen - a.amountPen),
    };
  },

  async create(data: {
    concept: string;
    category: string;
    amount: number;
    currency: string;
    date?: Date;
    recurring: boolean;
    period: string;
    vendor: string;
    notes: string;
  }): Promise<PlatformExpenseRow> {
    const row = await prisma.platformExpense.create({
      data: {
        concept: data.concept,
        category: data.category,
        amount: data.amount,
        currency: data.currency,
        ...(data.date ? { date: data.date } : {}),
        recurring: data.recurring,
        period: data.period,
        vendor: data.vendor,
        notes: data.notes,
      },
    });
    return mapRow(row);
  },

  async remove(id: string): Promise<void> {
    // PlatformExpense es GLOBAL de plataforma (sin tenantId por diseño, como otras
    // tablas de superadmin); la baja es por id (PK). deleteMany evita el throw de
    // delete() si ya no existe. Brandon 2026-06-30.
    // eslint-disable-next-line no-restricted-syntax -- tabla global de plataforma, sin tenantId
    await prisma.platformExpense.deleteMany({ where: { id } });
  },
};
