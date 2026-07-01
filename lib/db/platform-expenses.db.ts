import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

/**
 * PlatformExpensesDB — gastos REALES de plataforma (Buleje SaaS), distinto de
 * ExpensesDB (gastos por-tenant). Global, sin tenantId. Lo usa /superadmin/gastos
 * para responder "¿en qué gasta la plataforma?" y comparar contra el costo de
 * infra ESTIMADO (lib/cost-tracking). Brandon 2026-06-30.
 */

// Tipo de cambio USD→PEN para normalizar KPIs (muchas facturas son en USD:
// Vercel, Supabase, Anthropic). Solo para agregados; el monto original se preserva.
// Editable desde la UI y persistido en PlatformSettings; este es el valor por
// defecto/fallback. La UI muestra con qué cambio se normalizó (transparencia).
export const DEFAULT_USD_TO_PEN = 3.75;
const FX_KEY = "gastos.usdToPen";
const HISTORY_KEY = "gastos.history";
const MAX_HISTORY_MONTHS = 24;
const BUDGET_KEY = "gastos.monthlyBudgetPen";
const BUDGET_BY_CAT_KEY = "gastos.budgetByCategoryPen";
const OVERSPEND_ALERT_KEY = "gastos.overspendAlerted";

const monthKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
/** @deprecated usar getFxRate()/DEFAULT_USD_TO_PEN — se mantiene por compat. */
export const USD_TO_PEN = DEFAULT_USD_TO_PEN;

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
  prevMonthRunRatePen: number; // recurrentes + únicos del mes anterior (para comparar)
  recurringMonthlyPen: number; // solo recurrentes, normalizado a mes
  thisMonthOneTimePen: number; // gastos únicos con fecha en el mes actual
  byCategory: { category: string; amountPen: number }[]; // run-rate mensual por categoría
  // últimos 6 meses. `real` = viene de un cierre mensual congelado (snapshot);
  // false = estimado desde el recurrente de hoy (o mes en curso).
  trend: { label: string; totalPen: number; real: boolean }[];
}

/** Cierre mensual congelado de gasto (para historial real, no proyectado). */
export type ExpenseSnapshot = { totalPen: number; byCategory: Record<string, number> };
export type ExpenseHistory = Record<string, ExpenseSnapshot>; // key = "YYYY-MM"

/** Estado de dedup de alertas de sobregasto (para no re-avisar el mismo mes). */
type OverspendState = { month: string; global: boolean; categories: string[] };

/** Sobregastos NUEVOS (aún no avisados este mes) detectados por checkOverspend. */
export type OverspendResult = {
  global: { runRatePen: number; budgetPen: number } | null;
  categories: { category: string; spentPen: number; budgetPen: number }[];
};

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function toPen(amount: number, currency: string, fxRate: number): number {
  return currency === "USD" ? Math.round(amount * fxRate * 100) / 100 : amount;
}

/** Normaliza un gasto recurrente a su costo MENSUAL (anual → /12). */
function monthlyize(amountPen: number, period: string): number {
  if (period === "anual") return Math.round((amountPen / 12) * 100) / 100;
  return amountPen; // mensual o vacío = se asume mensual
}

function mapRow(
  r: {
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
  },
  fxRate: number,
): PlatformExpenseRow {
  const amount = toNumOrZero(r.amount);
  return {
    id: r.id,
    concept: r.concept,
    category: r.category,
    amount,
    currency: r.currency,
    amountPen: toPen(amount, r.currency, fxRate),
    date: r.date.toISOString(),
    recurring: r.recurring,
    period: r.period,
    vendor: r.vendor,
    notes: r.notes,
  };
}

export const PlatformExpensesDB = {
  /** Tipo de cambio USD→PEN vigente (persistido en settings, con fallback al default). */
  async getFxRate(): Promise<number> {
    const v = await PlatformSettingsDB.get<number>(FX_KEY);
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : DEFAULT_USD_TO_PEN;
  },

  async setFxRate(rate: number): Promise<void> {
    await PlatformSettingsDB.set(FX_KEY, rate, "superadmin");
  },

  // ── Presupuesto (tope global + por categoría) ──────────────────────────────
  async getBudget(): Promise<number | null> {
    const v = await PlatformSettingsDB.get<number>(BUDGET_KEY);
    return typeof v === "number" ? v : null;
  },

  async setBudget(v: number | null): Promise<void> {
    await PlatformSettingsDB.set(BUDGET_KEY, v, "superadmin");
  },

  async getBudgetByCategory(): Promise<Record<string, number>> {
    const v = await PlatformSettingsDB.get<Record<string, number>>(BUDGET_BY_CAT_KEY);
    return v && typeof v === "object" ? v : {};
  },

  /** Guarda solo categorías conocidas con tope > 0 (no ensucia el KV). */
  async setBudgetByCategory(map: Record<string, number>): Promise<void> {
    const known = new Set<string>(EXPENSE_CATEGORIES);
    const clean: Record<string, number> = {};
    for (const [k, val] of Object.entries(map)) {
      if (known.has(k) && val > 0) clean[k] = val;
    }
    await PlatformSettingsDB.set(BUDGET_BY_CAT_KEY, clean, "superadmin");
  },

  /**
   * Detecta sobregasto vs el tope global y los topes por categoría. Devuelve solo
   * los que NO se avisaron ya este mes (dedup en OVERSPEND_ALERT_KEY) para no
   * spamear: se avisa al cruzar el tope; si vuelve debajo, se rearma. El cron
   * `superadmin-alerts` manda el email con lo que esto devuelve.
   */
  async checkOverspend(): Promise<OverspendResult> {
    const [summary, budgetPen, budgetByCat, prev] = await Promise.all([
      this.summary(),
      this.getBudget(),
      this.getBudgetByCategory(),
      PlatformSettingsDB.get<OverspendState>(OVERSPEND_ALERT_KEY),
    ]);
    const month = monthKeyOf(new Date());
    const state: OverspendState =
      prev && prev.month === month
        ? { month, global: prev.global, categories: [...prev.categories] }
        : { month, global: false, categories: [] };

    const out: OverspendResult = { global: null, categories: [] };

    const runRate = summary.monthlyRunRatePen;
    const overGlobal = budgetPen !== null && budgetPen > 0 && runRate > budgetPen;
    if (overGlobal && !state.global) out.global = { runRatePen: runRate, budgetPen: budgetPen! };
    state.global = overGlobal;

    const spentByCat = new Map(summary.byCategory.map((c) => [c.category, c.amountPen]));
    const stillOver: string[] = [];
    for (const [cat, cap] of Object.entries(budgetByCat)) {
      if (!(cap > 0)) continue;
      const spent = spentByCat.get(cat) ?? 0;
      if (spent > cap) {
        stillOver.push(cat);
        if (!state.categories.includes(cat)) {
          out.categories.push({ category: cat, spentPen: spent, budgetPen: cap });
        }
      }
    }
    state.categories = stillOver;

    await PlatformSettingsDB.set(OVERSPEND_ALERT_KEY, state, "superadmin");
    return out;
  },

  /** Cierres mensuales congelados de gasto (historial real). */
  async getHistory(): Promise<ExpenseHistory> {
    const v = await PlatformSettingsDB.get<ExpenseHistory>(HISTORY_KEY);
    return v && typeof v === "object" ? v : {};
  },

  /**
   * Gasto de un mes concreto = recurrente (siempre cuenta) + únicos con fecha en
   * ese mes, por categoría. Misma fórmula que la tendencia de summary(); es lo que
   * se congela como cierre del mes.
   */
  async monthTotals(monthKey: string): Promise<ExpenseSnapshot> {
    const rows = await this.list();
    const round = (n: number) => Math.round(n * 100) / 100;
    const cat = new Map<string, number>();
    for (const r of rows) {
      const v = r.recurring
        ? monthlyize(r.amountPen, r.period)
        : monthKeyOf(new Date(r.date)) === monthKey
          ? r.amountPen
          : 0;
      if (v > 0) cat.set(r.category, (cat.get(r.category) ?? 0) + v);
    }
    let total = 0;
    const byCategory: Record<string, number> = {};
    for (const [k, v] of cat) {
      byCategory[k] = round(v);
      total += v;
    }
    return { totalPen: round(total), byCategory };
  },

  /**
   * Congela el gasto de `monthKey` en el historial (para que ese mes deje de
   * proyectarse desde el recurrente de hoy). Idempotente: reescribe esa entrada;
   * los demás meses no se tocan. Poda a los últimos MAX_HISTORY_MONTHS.
   */
  async recordSnapshot(monthKey: string): Promise<void> {
    const snap = await this.monthTotals(monthKey);
    const history = await this.getHistory();
    history[monthKey] = snap;
    const pruned: ExpenseHistory = Object.fromEntries(
      Object.entries(history)
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, MAX_HISTORY_MONTHS),
    );
    await PlatformSettingsDB.set(HISTORY_KEY, pruned, "superadmin");
  },

  /** Congela el MES EN CURSO. Se llama tras cada alta/edición/baja. */
  async recordCurrentMonthSnapshot(): Promise<void> {
    await this.recordSnapshot(monthKeyOf(new Date()));
  },

  /** Congela el MES ANTERIOR (cron mensual del día 1). Devuelve el mes cerrado. */
  async closePreviousMonth(): Promise<string> {
    const now = new Date();
    const key = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    await this.recordSnapshot(key);
    return key;
  },

  async list(fxRate?: number): Promise<PlatformExpenseRow[]> {
    const fx = fxRate ?? (await this.getFxRate());
    const rows = await prisma.platformExpense.findMany({ orderBy: { date: "desc" } });
    return rows.map((r) => mapRow(r, fx));
  },

  async summary(): Promise<PlatformExpenseSummary> {
    const [fx, history] = await Promise.all([this.getFxRate(), this.getHistory()]);
    const rows = await this.list(fx);
    const now = new Date();
    const monthKey = monthKeyOf;
    const thisKey = monthKey(now);
    const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const catMap = new Map<string, number>();
    const oneTimeByMonth = new Map<string, number>();
    let recurringMonthlyPen = 0;
    let recurringCount = 0;

    for (const r of rows) {
      if (r.recurring) {
        recurringCount += 1;
        const m = monthlyize(r.amountPen, r.period);
        recurringMonthlyPen += m;
        catMap.set(r.category, (catMap.get(r.category) ?? 0) + m);
      } else {
        const k = monthKey(new Date(r.date));
        oneTimeByMonth.set(k, (oneTimeByMonth.get(k) ?? 0) + r.amountPen);
        if (k === thisKey) catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amountPen);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const thisMonthOneTimePen = oneTimeByMonth.get(thisKey) ?? 0;
    const prevMonthOneTimePen = oneTimeByMonth.get(prevKey) ?? 0;

    // Tendencia últimos 6 meses. Mes con cierre congelado (snapshot) → valor real;
    // mes en curso o sin cierre → estimado (recurrente de hoy + únicos de ese mes).
    const trend: { label: string; totalPen: number; real: boolean }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const snap = key !== thisKey ? history[key] : undefined;
      trend.push({
        label: MONTHS_ES[d.getMonth()],
        totalPen: snap
          ? round(snap.totalPen)
          : round(recurringMonthlyPen + (oneTimeByMonth.get(key) ?? 0)),
        real: Boolean(snap),
      });
    }

    return {
      count: rows.length,
      recurringCount,
      monthlyRunRatePen: round(recurringMonthlyPen + thisMonthOneTimePen),
      prevMonthRunRatePen: round(recurringMonthlyPen + prevMonthOneTimePen),
      recurringMonthlyPen: round(recurringMonthlyPen),
      thisMonthOneTimePen: round(thisMonthOneTimePen),
      byCategory: Array.from(catMap.entries())
        .map(([category, amountPen]) => ({ category, amountPen: round(amountPen) }))
        .sort((a, b) => b.amountPen - a.amountPen),
      trend,
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
    return mapRow(row, await this.getFxRate());
  },

  async update(
    id: string,
    data: {
      concept: string;
      category: string;
      amount: number;
      currency: string;
      date?: Date;
      recurring: boolean;
      period: string;
      vendor: string;
      notes: string;
    },
  ): Promise<PlatformExpenseRow | null> {
    // Tabla global de plataforma (sin tenantId); edición por id (PK). updateMany
    // evita el throw P2025 si el gasto ya no existe → devolvemos null y el route
    // responde 404 controlado.
    /* eslint-disable no-restricted-syntax -- PlatformExpense es global de plataforma, sin tenantId por diseño */
    const res = await prisma.platformExpense.updateMany({
      where: { id },
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
    /* eslint-enable no-restricted-syntax */
    if (res.count === 0) return null;
    const row = await prisma.platformExpense.findFirst({ where: { id } });
    return row ? mapRow(row, await this.getFxRate()) : null;
  },

  async remove(id: string): Promise<void> {
    // PlatformExpense es GLOBAL de plataforma (sin tenantId por diseño, como otras
    // tablas de superadmin); la baja es por id (PK). deleteMany evita el throw de
    // delete() si ya no existe. Brandon 2026-06-30.
    // eslint-disable-next-line no-restricted-syntax -- tabla global de plataforma, sin tenantId
    await prisma.platformExpense.deleteMany({ where: { id } });
  },
};
