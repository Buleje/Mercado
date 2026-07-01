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

  /** Cierres mensuales congelados de gasto (historial real). */
  async getHistory(): Promise<ExpenseHistory> {
    const v = await PlatformSettingsDB.get<ExpenseHistory>(HISTORY_KEY);
    return v && typeof v === "object" ? v : {};
  },

  /**
   * Congela el gasto del MES EN CURSO en el historial (para que meses pasados
   * dejen de proyectarse desde el recurrente de hoy). Idempotente: reescribe la
   * entrada del mes actual con el run-rate vigente; los meses pasados no se tocan.
   * Se llama tras cada alta/edición/baja. Poda a los últimos MAX_HISTORY_MONTHS.
   */
  async recordCurrentMonthSnapshot(): Promise<void> {
    const s = await this.summary();
    const history = await this.getHistory();
    const thisKey = monthKeyOf(new Date());
    history[thisKey] = {
      totalPen: s.monthlyRunRatePen,
      byCategory: Object.fromEntries(s.byCategory.map((c) => [c.category, c.amountPen])),
    };
    const pruned: ExpenseHistory = Object.fromEntries(
      Object.entries(history)
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, MAX_HISTORY_MONTHS),
    );
    await PlatformSettingsDB.set(HISTORY_KEY, pruned, "superadmin");
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
