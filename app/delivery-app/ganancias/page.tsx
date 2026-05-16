"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle, Printer, TrendingUp } from "@buleje/design-system/icons";
import { CashIcon, MotoIcon, TipIcon } from "@/components/delivery/icons";

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
  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? "";
  const avg = data && data.totals.deliveries > 0 ? data.totals.total / data.totals.deliveries : 0;

  return (
    <div className="earnings-print-root">
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .earnings-print-hide { display: none !important; }
          .earnings-print-root { padding: 1.5cm !important; }
          .earnings-print-show { display: block !important; }
          [data-print-card] {
            border: 1px solid #ccc !important;
            background: white !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }
        }
        .earnings-print-show { display: none; }
      `}</style>

      <div className="earnings-print-show max-w-2xl mx-auto px-4 py-6 mb-4 border-b-2 border-black/30">
        <h1 className="text-2xl font-extrabold text-black">Reporte de ganancias — Buleje</h1>
        <p className="text-sm text-black/70 mt-1">
          Periodo: <strong>{periodLabel}</strong> · Generado el {new Date().toLocaleDateString("es-PE")}
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-6">
        <header className="flex items-start justify-between gap-3 earnings-print-hide">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <CashIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-extrabold text-[var(--text-primary)] leading-tight">
                Mis ganancias
              </h1>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Tu rendimiento por periodo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            aria-label="Imprimir reporte"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </header>

        {/* Period tabs */}
        <div className="earnings-print-hide flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`h-11 px-5 rounded-2xl text-sm font-extrabold transition-colors ${
                period === p.id
                  ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/20"
                  : "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-2xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-4 py-3 text-base font-bold text-[var(--brand-danger)] flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Hero total */}
            <div
              data-print-card
              className="rounded-3xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-6 lg:p-8"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Total ganado · {periodLabel}
                  </p>
                  <p className="mt-2 text-5xl lg:text-6xl font-extrabold text-[var(--accent)] tabular-nums">
                    S/ {Number(data.totals.total).toFixed(2)}
                  </p>
                  <p className="mt-2 text-base font-semibold text-[var(--text-secondary)]">
                    {data.totals.deliveries} {data.totals.deliveries === 1 ? "entrega" : "entregas"}
                    {data.totals.deliveries > 0 && (
                      <span className="text-[var(--text-tertiary)]"> · S/ {avg.toFixed(2)} prom.</span>
                    )}
                  </p>
                </div>
                <div className="h-16 w-16 lg:h-20 lg:w-20 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white flex items-center justify-center shrink-0">
                  <CashIcon className="h-9 w-9 lg:h-11 lg:w-11" />
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div data-print-card className="grid sm:grid-cols-2 gap-3 lg:gap-4">
              <BreakdownCard
                icon={<MotoIcon className="h-6 w-6 text-[var(--accent)]" />}
                title="Por entregas"
                amount={data.totals.fees}
                accent="accent"
              />
              <BreakdownCard
                icon={<TipIcon className="h-6 w-6 text-[var(--brand-secondary)]" />}
                title="Propinas"
                amount={data.totals.tips}
                accent="amber"
              />
            </div>

            {/* Por día */}
            <div data-print-card className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6">
              <h3 className="text-base lg:text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
                Detalle por día
              </h3>
              <div className="space-y-2">
                {data.byDay.length === 0 ? (
                  <p className="text-base text-[var(--text-tertiary)] text-center py-10">
                    Aún no tienes entregas en este periodo.
                  </p>
                ) : (
                  data.byDay.map((d) => {
                    const total = d.fees + d.tips;
                    const pct = maxFees > 0 ? (total / maxFees) * 100 : 0;
                    return (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="w-14 text-sm text-[var(--text-tertiary)] font-bold tabular-nums shrink-0">
                          {d.date.slice(5)}
                        </span>
                        <div className="flex-1 h-9 rounded-xl bg-[var(--surface-sunken)] overflow-hidden relative">
                          {pct > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 bg-[var(--accent)] rounded-xl"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-[var(--text-primary)] mix-blend-difference invert">
                            {d.count} entrega{d.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="w-24 text-right text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                          S/ {total.toFixed(2)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownCard({
  icon,
  title,
  amount,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  amount: number;
  accent: "accent" | "amber";
}) {
  const ring = accent === "accent" ? "bg-[var(--accent-soft)]" : "bg-[var(--brand-secondary)]/10";
  return (
    <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${ring}`}>
          {icon}
        </div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </p>
      </div>
      <p className="mt-2 text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">
        S/ {amount.toFixed(2)}
      </p>
    </div>
  );
}
