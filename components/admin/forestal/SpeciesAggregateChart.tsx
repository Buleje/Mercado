"use client";

/**
 * SpeciesAggregateChart — Dashboard CTP (ADR-124 Phase 4).
 *
 * Bar chart horizontal con volumen total por especie (validado + procesado).
 * Sin librería externa (recharts/chart.js) — bars CSS puros para 0 bundle.
 *
 * Filtro temporal: hoy / 7d / 30d / 90d / año / all.
 */
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, RefreshCw, AlertCircle } from "@buleje/design-system/icons";

interface Aggregate {
  species: string;
  totalVolumeM3: number;
  totalPieces: number;
  entryCount: number;
}

interface AggregateResponse {
  aggregates: Aggregate[];
  grandTotal: { volume: number; pieces: number; entries: number };
  species_count: number;
  generated_at: string;
}

type Period = "7d" | "30d" | "90d" | "year" | "all";

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  year: "Este año",
  all: "Todo el histórico",
};

function dateRangeForPeriod(p: Period): { from?: string; to?: string } {
  if (p === "all") return {};
  const now = new Date();
  const days = p === "7d" ? 7 : p === "30d" ? 30 : p === "90d" ? 90 : 365;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export default function SpeciesAggregateChart() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = dateRangeForPeriod(period);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(
        `/api/admin/forestal/wood-entries/aggregate?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const maxVolume = useMemo(() => {
    if (!data?.aggregates?.length) return 0;
    return Math.max(...data.aggregates.map((a) => a.totalVolumeM3));
  }, [data]);

  const top = data?.aggregates.slice(0, 15) ?? [];

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[var(--brand-ink)]" />
          <h3 className="text-base font-extrabold text-[var(--text-primary)]">
            Volumen por especie ({PERIOD_LABEL[period]})
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none"
          >
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
            <option value="year">Este año</option>
            <option value="all">Todo el histórico</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Recargar dashboard"
            className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-danger-300)] bg-[var(--data-danger-50)] p-3 text-sm text-[var(--data-danger-900)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grand totals */}
      {data && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Kpi
            label="Volumen total"
            value={`${data.grandTotal.volume.toFixed(2)} m³`}
          />
          <Kpi label="Piezas" value={data.grandTotal.pieces.toLocaleString("es-PE")} />
          <Kpi
            label="Especies"
            value={data.species_count.toString()}
            sub={`${data.grandTotal.entries} registros`}
          />
        </div>
      )}

      {/* Bar chart horizontal */}
      <div className="space-y-2">
        {loading && !data && (
          <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && top.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            Sin datos en este período. Probá un rango más amplio o registrá
            ingresos validados.
          </div>
        )}

        {top.map((a) => {
          const pct = maxVolume > 0 ? (a.totalVolumeM3 / maxVolume) * 100 : 0;
          return (
            <div key={a.species} className="grid grid-cols-[160px_1fr_120px] items-center gap-3">
              <div
                title={a.species}
                className="truncate text-sm font-bold text-[var(--text-primary)]"
              >
                {a.species}
              </div>
              <div className="relative h-7 rounded-lg bg-[var(--surface-canvas)]">
                <div
                  className="h-full rounded-lg bg-linear-to-r from-[var(--data-success-500)] to-[var(--data-success-700)] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right">
                <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {a.totalVolumeM3.toFixed(2)} m³
                </span>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {a.entryCount} reg · {a.totalPieces} pz
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{sub}</div>
      )}
    </div>
  );
}
