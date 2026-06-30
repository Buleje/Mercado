/**
 * Helpers compartidos de /superadmin/gastos (Brandon 2026-06-30): metadata de
 * categorías (label + color para la dona), formato PEN y export a CSV.
 */

export type Expense = {
  id: string; concept: string; category: string; amount: number; currency: string;
  amountPen: number; date: string; recurring: boolean; period: string; vendor: string; notes: string;
};

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
