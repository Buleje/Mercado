/**
 * Helpers compartidos de /superadmin/gastos (Brandon 2026-06-30): metadata de
 * categorías (label + color para la dona), formato PEN y export a CSV.
 */

export type Expense = {
  id: string; concept: string; category: string; amount: number; currency: string;
  amountPen: number; date: string; recurring: boolean; period: string; vendor: string; notes: string;
};

export type Summary = {
  count: number; recurringCount: number; monthlyRunRatePen: number; prevMonthRunRatePen: number;
  recurringMonthlyPen: number; thisMonthOneTimePen: number;
  byCategory: { category: string; amountPen: number }[];
  trend: { label: string; totalPen: number; real: boolean }[];
};
export type TenantCost = {
  tenantId: string; tenantName: string; plan: string;
  storageCost: number; computeCost: number; aiCost: number; totalCost: number; grossMargin: number;
};
export type CostsData = { totalMonthlyCost: number; avgGrossMargin: number; tenants: TenantCost[] };

/** Tope mensual en PEN por categoría (key = category). 0/ausente = sin tope. */
export type BudgetByCategory = Record<string, number>;

/** P&L de la plataforma: ingresos (MRR) vs gasto real mensual. */
export type Pnl = {
  mrrPen: number;
  runRatePen: number;
  profitPen: number; // mrr - gasto/mes (puede ser negativo)
  marginPct: number | null; // profit / mrr * 100; null si no hay ingresos
  annualProfitPen: number; // profit * 12
  /** Tiendas que pagan necesarias para cubrir el gasto, dado el ticket promedio. null si no se puede estimar. */
  breakEvenTenants: number | null;
};

/** Calcula el P&L. `avgRevenuePerTenant` = ticket promedio (MRR / tiendas que pagan). */
export function computePnl(
  mrrPen: number,
  runRatePen: number,
  avgRevenuePerTenant: number | null,
): Pnl {
  const profitPen = Math.round((mrrPen - runRatePen) * 100) / 100;
  const marginPct = mrrPen > 0 ? Math.round((profitPen / mrrPen) * 1000) / 10 : null;
  const breakEvenTenants =
    avgRevenuePerTenant && avgRevenuePerTenant > 0
      ? Math.ceil(runRatePen / avgRevenuePerTenant)
      : null;
  return {
    mrrPen,
    runRatePen,
    profitPen,
    marginPct,
    annualProfitPen: Math.round(profitPen * 12 * 100) / 100,
    breakEvenTenants,
  };
}

/** Clase compartida de inputs/selects (h-12, border-2, tokens DS). */
export const INPUT_CLASS =
  "h-12 w-full rounded-lg border-2 border-[var(--surface-border)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none";

export const CAT_KEYS = [
  "infra", "mensajeria", "ia", "pagos", "personal", "marketing", "otros",
] as const;

// Tokens del DS con fallback hex (patrón superadmin); la dona necesita 7 colores
// distinguibles, más que los 4 tokens --data-*.
export const CAT_META: Record<string, { label: string; color: string }> = {
  infra: { label: "Infraestructura", color: "var(--data-info-500,#3b82f6)" },
  mensajeria: { label: "Mensajería", color: "var(--data-success-500,#10b981)" },
  ia: { label: "IA", color: "var(--accent,#00a0a0)" },
  pagos: { label: "Pagos / Fees", color: "var(--data-warning-500,#f59e0b)" },
  personal: { label: "Personal", color: "#8b5cf6" },
  marketing: { label: "Marketing", color: "var(--data-error-500,#ef4444)" },
  otros: { label: "Otros", color: "#94a3b8" },
};

export const fmtPen = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Formato corto para ejes/labels (S/ 1.2k, S/ 3.4M). */
export const fmtPenShort = (n: number) => {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(1)}k`;
  return `S/ ${Math.round(n)}`;
};

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serializa los gastos a CSV (para contabilidad / Excel). */
export function expensesToCSV(rows: Expense[]): string {
  const header = [
    "Concepto", "Categoría", "Monto", "Moneda", "MontoPEN_mes",
    "Recurrente", "Periodo", "Proveedor", "Fecha",
  ];
  const lines = rows.map((r) =>
    [
      r.concept, CAT_META[r.category]?.label ?? r.category, r.amount, r.currency,
      r.amountPen, r.recurring ? "sí" : "no", r.period, r.vendor, r.date.slice(0, 10),
    ].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
