"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
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
  if (pct >= 70) return "bg-[#2d6a4f] text-white";
  if (pct >= 50) return "bg-[#40916c] text-white";
  if (pct >= 35) return "bg-[#74c69d] text-gray-900";
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
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Calculando retencion de clientes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-6 text-sm text-red-600 dark:text-red-400">
        {error}
        <button onClick={load} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  if (cohorts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-gray-500">
        No hay suficientes datos para calcular cohortes de retencion.
      </div>
    );
  }

  const maxCols = Math.max(...cohorts.map((r) => r.retention.length));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Retencion de clientes
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Porcentaje de clientes que volvieron a comprar en meses siguientes
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
            ? "bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
            : "bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
        )}>
          Tu retencion promedio al primer mes es <strong>{avgRetention}%</strong>
          {avgRetention >= 50
            ? " — excelente, por encima del promedio del sector."
            : " — meta recomendada: 60%. Considera programas de fidelidad."}
        </div>
      )}

      {/* Cohort table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Cohorte
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Clientes
              </th>
              {Array.from({ length: maxCols }, (_, i) => (
                <th key={i} className="px-4 py-3 text-center font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Mes {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {cohorts.map((row) => (
              <tr key={row.cohortMonth}>
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">
                  {row.initial}
                </td>
                {Array.from({ length: maxCols }, (_, i) => {
                  const val = row.retention[i];
                  return (
                    <td key={i} className="px-4 py-3 text-center">
                      {val === null ? (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
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
          { label: "70%+", cls: "bg-[#2d6a4f] text-white" },
          { label: "50-69%", cls: "bg-[#40916c] text-white" },
          { label: "35-49%", cls: "bg-[#74c69d] text-gray-900" },
          { label: "20-34%", cls: "bg-amber-200 text-amber-900" },
          { label: "<20%", cls: "bg-red-100 text-red-700" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-4 w-8 rounded", l.cls)} />
            <span className="text-gray-500 dark:text-gray-400">{l.label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Basado en fecha de ultima compra vs mes de ingreso. Para cohortes exactas se requiere historial completo de pedidos por cliente.
      </p>
    </div>
  );
}
