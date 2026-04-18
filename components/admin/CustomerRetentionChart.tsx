"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  createdAt: string;
  orderCount?: number;
  lastOrderDate?: string | null;
};

type CohortRow = {
  cohortMonth: string;      // e.g. "2024-01"
  label: string;            // e.g. "Ene 2024"
  initial: number;          // customers who first bought this month
  retention: (number | null)[]; // [month1, month2, ...] as % returned
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return toMonthKey(d);
}

// Build simple cohort from customer list + their orders
// Since we only have customers with orderCount and lastOrderDate, we use a simplified model:
// Cohort = month of createdAt. Retention[n] = % of cohort customers who had activity in month n.
function buildCohorts(customers: Customer[]): CohortRow[] {
  const now = new Date();
  const currentMonthKey = toMonthKey(now);

  // Group customers by their first month (createdAt)
  const cohortMap = new Map<string, string[]>(); // monthKey -> phones
  for (const c of customers) {
    if (!c.createdAt) continue;
    const key = toMonthKey(new Date(c.createdAt));
    if (!cohortMap.has(key)) cohortMap.set(key, []);
    cohortMap.get(key)!.push(c.phone);
  }

  // For each cohort, estimate retention using lastOrderDate
  // We can't know exact per-month activity without full order history,
  // so we use: customer "retained" in month X if lastOrderDate >= that month
  const phoneToCustomer = new Map(customers.map((c) => [c.phone, c]));

  const sortedKeys = [...cohortMap.keys()].sort().slice(-6); // last 6 cohort months

  const rows: CohortRow[] = [];

  for (const cohortKey of sortedKeys) {
    const phones = cohortMap.get(cohortKey) ?? [];
    const initial = phones.length;
    if (initial === 0) continue;

    const retentionCols: (number | null)[] = [];

    // Check up to 5 subsequent months
    for (let offset = 1; offset <= 5; offset++) {
      const targetMonth = addMonths(cohortKey, offset);
      if (targetMonth > currentMonthKey) {
        retentionCols.push(null); // future month
        continue;
      }

      // Count customers who have lastOrderDate in or after targetMonth (proxy for retention)
      const retained = phones.filter((ph) => {
        const c = phoneToCustomer.get(ph);
        if (!c?.lastOrderDate) return false;
        const lastMonth = toMonthKey(new Date(c.lastOrderDate));
        return lastMonth >= targetMonth;
      }).length;

      retentionCols.push(initial > 0 ? Math.round((retained / initial) * 100) : 0);
    }

    rows.push({
      cohortMonth: cohortKey,
      label: monthLabel(cohortKey),
      initial,
      retention: retentionCols,
    });
  }

  return rows;
}

// ─── Color helper ─────────────────────────────────────────────────────────────

function retentionColor(pct: number): string {
  if (pct >= 70) return "bg-[#00B4A6] text-white";
  if (pct >= 50) return "bg-[#33C4B8] text-white";
  if (pct >= 35) return "bg-[#74c69d] text-[var(--text-primary)]";
  if (pct >= 20) return "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerRetentionChart() {
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avgRetention, setAvgRetention] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch customers with order data
      const res = await fetch("/api/analytics/segments");
      if (!res.ok) throw new Error("No se pudo cargar datos de clientes");
      const data = await res.json() as { customers?: Customer[] } | Customer[];
      const customers: Customer[] = Array.isArray(data) ? data : (data as { customers?: Customer[] }).customers ?? [];

      const rows = buildCohorts(customers);
      setCohorts(rows);

      // Calculate average retention (month 1)
      const month1Vals = rows
        .map((r) => r.retention[0])
        .filter((v): v is number => v !== null);
      if (month1Vals.length > 0) {
        setAvgRetention(Math.round(month1Vals.reduce((a, b) => a + b, 0) / month1Vals.length));
      }
    } catch {
      setError("No se pudieron cargar los datos de retencion");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-[var(--text-secondary)]">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Calculando retencion de clientes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-error)] dark:border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/10 p-6 text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">
        {error}
        <button onClick={load} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  if (cohorts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center text-[var(--text-secondary)]">
        No hay suficientes datos para calcular cohortes de retencion.
      </div>
    );
  }

  const maxCols = Math.max(...cohorts.map((r) => r.retention.length));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Retencion de clientes
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Porcentaje de clientes que volvieron a comprar en meses siguientes
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)]"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {/* Insight banner */}
      {avgRetention !== null && (
        <div className={cn(
          "rounded-xl px-5 py-3 text-sm font-medium",
          avgRetention >= 50
            ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30"
            : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/10 text-[var(--data-warning)] dark:text-[var(--data-warning)] border border-[var(--data-warning)] dark:border-[var(--data-warning)]"
        )}>
          Tu retencion promedio al primer mes es <strong>{avgRetention}%</strong>
          {avgRetention >= 50
            ? " — excelente, por encima del promedio del sector."
            : " — meta recomendada: 60%. Considera programas de fidelidad."}
        </div>
      )}

      {/* Cohort table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                Cohorte
              </th>
              <th className="px-4 py-3 text-left font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                Clientes
              </th>
              {Array.from({ length: maxCols }, (_, i) => (
                <th key={i} className="px-4 py-3 text-center font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                  Mes {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-[var(--surface-raised)]">
            {cohorts.map((row) => (
              <tr key={row.cohortMonth}>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)] font-medium">
                  {row.initial}
                </td>
                {Array.from({ length: maxCols }, (_, i) => {
                  const val = row.retention[i];
                  return (
                    <td key={i} className="px-4 py-3 text-center">
                      {val === null ? (
                        <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">—</span>
                      ) : (
                        <span className={cn("inline-block px-2 py-0.5 rounded-md text-xs font-semibold min-w-[3rem]", retentionColor(val))}>
                          {val}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: "70%+", cls: "bg-[#00B4A6] text-white" },
          { label: "50-69%", cls: "bg-[#33C4B8] text-white" },
          { label: "35-49%", cls: "bg-[#74c69d] text-[var(--text-primary)]" },
          { label: "20-34%", cls: "bg-[var(--data-warning)] text-[var(--data-warning)]" },
          { label: "<20%", cls: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-4 w-8 rounded", l.cls)} />
            <span className="text-[var(--text-tertiary)]">{l.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Basado en fecha de ultima compra vs mes de ingreso. Para cohortes exactas se requiere historial completo de pedidos por cliente.
      </p>
    </div>
  );
}
