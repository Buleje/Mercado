"use client";

import { CardTitle, LoadingState, PageTitle } from "@buleje/design-system";
import { useEffect, useState } from "react";
import {
  Brain, Download, TrendingUp, AlertTriangle,
  Target, ArrowUpRight, ArrowDownRight, Package, Calendar, Clock,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { Anomalia } from "@/app/api/analytics/anomalias/route";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Tarjeta de KPI: `pct` sólo cuando el endpoint trae comparación vs. período
 *  anterior (ingresos/ticket/transacciones/margen la traen; fiado pendiente y
 *  stock crítico no — se muestran con `caption` en vez de inventar un % que
 *  el backend no calcula). */
type KpiCard = { label: string; value: string; pct?: number; caption?: string };

type KpisResponse = {
  ingresosHoy: { valor: number; cambio: number };
  ticketPromedio: { valor: number; cambio: number };
  transaccionesHoy: { valor: number; cambio: number };
  margenOperativo: { valor: number; cambio: number };
  fiadoPendiente: { valor: number; count: number };
  stockCritico: { valor: number };
};

type Predictions = {
  salesForecast: number;
  trendPct: number;
  stockRisk: { id: string; name: string }[];
  bestPurchaseDay: { day: string; reason: string };
  peakHour: { hour: number; label: string };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

function kpisATarjetas(k: KpisResponse): KpiCard[] {
  return [
    { label: "Ingresos hoy", value: fmt(k.ingresosHoy.valor), pct: k.ingresosHoy.cambio },
    { label: "Ticket promedio", value: fmt(k.ticketPromedio.valor), pct: k.ticketPromedio.cambio },
    { label: "Transacciones hoy", value: String(k.transaccionesHoy.valor), pct: k.transaccionesHoy.cambio },
    { label: "Margen operativo", value: `${k.margenOperativo.valor.toFixed(1)}%`, pct: k.margenOperativo.cambio },
    { label: "Fiado pendiente", value: fmt(k.fiadoPendiente.valor), caption: `${k.fiadoPendiente.count} cuenta${k.fiadoPendiente.count === 1 ? "" : "s"}` },
    { label: "Stock crítico", value: String(k.stockCritico.valor), caption: "producto(s) bajo el mínimo" },
  ];
}

const SEV_META: Record<Anomalia["severity"], { bg: string; text: string }> = {
  alto: { bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border-[var(--data-error-500)]/30 dark:border-[var(--data-error-500)]/30", text: "text-[var(--data-error-500)]" },
  medio: { bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 border-[var(--data-warning-500)]/30 dark:border-[var(--data-warning-500)]/30", text: "text-[var(--data-warning-500)]" },
  bajo: { bg: "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", text: "text-[var(--data-success-500)]" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessIntelligenceTab() {
  const [kpis, setKpis] = useState<KpiCard[] | null>(null);
  const [anomalias, setAnomalias] = useState<Anomalia[] | null>(null);
  const [predictions, setPredictions] = useState<Predictions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetch("/api/analytics/kpis", { credentials: "include", signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/analytics/anomalias", { credentials: "include", signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/analytics/predictions", { credentials: "include", signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([k, a, p]) => {
        if (k) setKpis(kpisATarjetas(k as KpisResponse));
        if (a) setAnomalias((a.anomalias ?? []) as Anomalia[]);
        if (p) setPredictions(p as Predictions);
      })
      .catch((e) => { if ((e as Error).name !== "AbortError") { setKpis([]); setAnomalias([]); } })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> Business Intelligence
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">KPIs, proyección de ventas y alertas de anomalías</p>
        </div>
        {kpis && kpis.length > 0 && (
          <button onClick={() => exportToCSV(kpis.map(k => ({ kpi: k.label, valor: k.value, cambio: k.pct != null ? `${k.pct}%` : k.caption ?? "" })), "bi-kpis")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        )}
      </div>

      {/* KPIs */}
      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{kpi.label}</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{kpi.value}</p>
              <div className="flex items-center gap-1 mt-1">
                {kpi.pct != null ? (
                  <>
                    {kpi.pct >= 0 ? <ArrowUpRight className="h-3 w-3 text-[var(--data-success-500)]" /> : <ArrowDownRight className="h-3 w-3 text-[var(--data-error-500)]" />}
                    <span className={cn("text-xs font-bold", kpi.pct >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{kpi.pct > 0 ? "+" : ""}{kpi.pct}%</span>
                    <span className="text-xs text-[var(--text-tertiary)] ml-1">vs. antes</span>
                  </>
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)]">{kpi.caption}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Forecast — próxima semana, dato real (/api/analytics/predictions) */}
      {predictions && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
          <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2 mb-4"><Target className="h-4 w-4 text-primary" /> Proyección de ventas — próximos 7 días</CardTitle>
          <div className="flex flex-wrap items-baseline gap-3 mb-4">
            <p className="text-2xl font-extrabold text-primary">{fmt(predictions.salesForecast)}</p>
            <span className={cn("inline-flex items-center gap-1 text-xs font-bold", predictions.trendPct >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
              <TrendingUp className="h-3 w-3" /> {predictions.trendPct > 0 ? "+" : ""}{predictions.trendPct}% vs. promedio de 4 semanas
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2">
              <Package className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">{predictions.stockRisk.length} producto(s) en riesgo de agotarse en 7 días</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">Mejor día para comprar: <b>{predictions.bestPurchaseDay.day}</b></p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-[var(--text-secondary)]">Hora pico: <b>{predictions.peakHour.label}</b></p>
            </div>
          </div>
        </div>
      )}

      {/* Anomaly alerts */}
      {anomalias && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
          <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2 mb-4"><AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" /> Alertas de anomalías {anomalias.length > 0 && `(${anomalias.length})`}</CardTitle>
          {anomalias.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin anomalías detectadas — todo marcha bien.</p>
          ) : (
            <div className="space-y-2">
              {anomalias.map((a, i) => (
                <div key={`${a.type}-${i}`} className={cn("rounded-xl p-3 border", SEV_META[a.severity].bg)}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.title}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{a.body}</p>
                    </div>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full shrink-0", SEV_META[a.severity].text)}>{a.severity}</span>
                  </div>
                  <a href={a.actionUrl} className="mt-1.5 inline-block text-xs font-bold text-primary hover:underline">{a.actionLabel} →</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
