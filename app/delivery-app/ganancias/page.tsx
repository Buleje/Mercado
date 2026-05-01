"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, DollarSign, TrendingUp, Gift, Bike, AlertTriangle } from "@buleje/design-system/icons";

interface Earnings {
  period: string;
  totals: { deliveries: number; fees: number; tips: number; total: number };
  byDay: { date: string; fees: number; tips: number; count: number }[];
}

const PERIODS: { id: "today" | "week" | "month" | "all"; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "week",  label: "7 días" },
  { id: "month", label: "30 días" },
  { id: "all",   label: "Todo" },
];

export default function GananciasPage() {
  const router = useRouter();
  const [data, setData] = useState<Earnings | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/delivery/me/earnings?period=${period}`, { credentials: "include" })
      .then((r) => {
        if (r.status === 401) { router.push("/delivery-app/login"); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d: Earnings | null) => {
        if (d) setData(d);
        else setError("No pudimos cargar tus ganancias.");
      })
      .catch(() => setError("Error de red."))
      .finally(() => setLoading(false));
  }, [period, router]);

  const maxFees = data?.byDay.reduce((m, d) => Math.max(m, d.fees + d.tips), 0) ?? 0;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3">
        <h1 className="font-extrabold text-[var(--text-primary)] flex items-center gap-2 max-w-2xl mx-auto">
          <DollarSign className="h-5 w-5 text-[var(--accent)]" />
          Mis ganancias
        </h1>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                period === p.id
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="inline h-4 w-4 mr-1.5 mb-0.5" />
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Totals */}
            <div className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent)]/5 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total ganado</p>
              <p className="mt-1 text-4xl font-extrabold text-[var(--accent)]">
                S/ {data.totals.total.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {data.totals.deliveries} {data.totals.deliveries === 1 ? "entrega" : "entregas"} este periodo
              </p>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bike className="h-4 w-4 text-[var(--text-secondary)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Por entregas</p>
                </div>
                <p className="text-2xl font-extrabold text-[var(--text-primary)]">S/ {data.totals.fees.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="h-4 w-4 text-[var(--text-secondary)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Propinas</p>
                </div>
                <p className="text-2xl font-extrabold text-[var(--text-primary)]">S/ {data.totals.tips.toFixed(2)}</p>
              </div>
            </div>

            {/* Chart simple */}
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4" />
                Por día
              </h3>
              <div className="space-y-1">
                {data.byDay.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                    Aún no tenés entregas.
                  </p>
                ) : (
                  data.byDay.map((d) => {
                    const total = d.fees + d.tips;
                    const pct = maxFees > 0 ? (total / maxFees) * 100 : 0;
                    return (
                      <div key={d.date} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-[var(--text-tertiary)] tabular-nums">
                          {d.date.slice(5)}
                        </span>
                        <div className="flex-1 h-6 rounded bg-[var(--surface-sunken)] overflow-hidden relative">
                          {pct > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 bg-[var(--accent)]"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                        <span className="w-20 text-right font-bold text-[var(--text-primary)] tabular-nums">
                          S/ {total.toFixed(0)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
