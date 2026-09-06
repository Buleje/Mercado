"use client";

/**
 * CohortsConsole — cohortes & retención (Brandon 2026-06-19). Heatmap de
 * retención: por mes de alta, qué % de negocios sigue activo mes a mes. Verde =
 * retiene, rojo = se cae. Datos reales de /api/superadmin/cohorts.
 */

import { useCallback, useEffect, useState } from "react";
import { Users, Layers, TrendingUp, Activity, RefreshCw } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Cohort = { month: string; size: number; retention: (number | null)[] };
type Data = { cohorts: Cohort[]; maxMonths: number; kpis: { tenants: number; cohorts: number; m1Retention: number | null; activeNow: number } };

function cellClass(v: number | null): string {
  if (v == null) return "bg-[var(--surface-sunken)]/40 text-transparent";
  if (v >= 70) return "bg-[var(--data-success-500)]/20 text-[var(--data-success-700,#047857)] dark:text-[var(--data-success-300,#6ee7b7)]";
  if (v >= 40) return "bg-[#0d9488]/15 text-[#0d9488]";
  if (v > 0) return "bg-[var(--data-error-500)]/15 text-[var(--data-error-600,#dc2626)]";
  return "bg-[var(--data-error-500)]/25 text-[var(--data-error-600,#dc2626)]";
}

export function CohortsConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/cohorts", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(), 120_000);

  if (loading && !d) return <div className="h-72 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const k = d.kpis;
  const cols = Array.from({ length: d.maxMonths + 1 }, (_, i) => i);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAKpiCard icon={Users} label="Negocios" value={k.tenants} sub="total" />
        <SAKpiCard icon={Layers} label="Cohortes" value={k.cohorts} sub="meses de alta" />
        <SAKpiCard icon={TrendingUp} label="Retención M1" value={k.m1Retention == null ? "—" : `${k.m1Retention}%`} sub="al mes siguiente" tone={k.m1Retention != null && k.m1Retention >= 70 ? "good" : k.m1Retention != null && k.m1Retention >= 40 ? "warn" : "bad"} />
        <SAKpiCard icon={Activity} label="Activos ahora" value={`${k.activeNow}/${k.tenants}`} tone={k.activeNow === k.tenants ? "good" : "warn"} />
      </div>

      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
          <div>
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Retención por cohorte</h3>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">M0 = mes de alta. % de negocios de esa cohorte activos en cada mes.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center rounded-lg border border-[var(--rule-base)] px-2 text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
        </header>
        <div className="overflow-x-auto p-4">
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="text-left text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] px-2">Cohorte</th>
                <th className="text-center text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] px-2">Altas</th>
                {cols.map((c) => <th key={c} className="text-center text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] w-14">M{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.cohorts.map((row) => (
                <tr key={row.month}>
                  <td className="px-2 font-bold text-[var(--text-primary)] whitespace-nowrap capitalize">{row.month}</td>
                  <td className="px-2 text-center tabular-nums text-[var(--text-secondary)]">{row.size}</td>
                  {cols.map((c) => {
                    const v = row.retention[c] ?? null;
                    return <td key={c} className={`rounded-lg text-center py-2 font-bold tabular-nums text-xs ${cellClass(v)}`}>{v == null ? "·" : `${v}%`}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Activo = registró actividad ese mes. Verde retiene, rojo se cae. Con pocos negocios cada % es 1 tienda — la señal se afina al crecer.</p>
        </div>
      </section>
    </div>
  );
}
