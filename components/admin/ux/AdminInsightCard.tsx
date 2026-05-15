"use client";

import { memo, useMemo } from "react";
import { Sparkles, ArrowUpRight, Lightbulb } from "@buleje/design-system/icons";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@buleje/design-system";

/**
 * AdminInsightCard — hero card "Hoy" del admin.
 *
 * Patrón F-pattern de research 2026: hero KPI top-left, más grande.
 * 3-5 contextual metrics debajo. Un insight accionable al final
 * (Cialdini commitment — "ya detectamos X, prueba Y").
 *
 * @example
 * <AdminInsightCard
 *   greeting="Buen día, Brandon"
 *   heroLabel="Ventas de hoy"
 *   heroValue={4520}
 *   heroPrefix="S/ "
 *   heroDelta={12.5}
 *   heroDeltaLabel="vs ayer"
 *   trend={[200, 180, 340, 420, 380, 450, 520]}
 *   insight={{
 *     type: "opportunity",
 *     text: "Tus ventas de la tarde cayeron 20%. ¿Creamos una promo flash?",
 *     cta: { label: "Crear promo", href: "/admin?module=promociones&action=new" },
 *   }}
 *   contextualMetrics={[
 *     { label: "Pedidos", value: 34, delta: 5.2 },
 *     { label: "Clientes nuevos", value: 7, delta: 40 },
 *     { label: "Ticket promedio", value: 47.8, prefix: "S/ ", delta: -2.1, decimals: 2 },
 *     { label: "Stock crítico", value: 3, status: "warning" },
 *   ]}
 * />
 */

export interface InsightAction {
  type: "opportunity" | "warning" | "info";
  text: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}

export interface ContextualMetric {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: number;
  decimals?: number;
  status?: "success" | "warning" | "danger";
}

interface Props {
  greeting?: string;
  heroLabel: string;
  heroValue: number;
  heroPrefix?: string;
  heroSuffix?: string;
  heroDecimals?: number;
  heroDelta?: number;
  heroDeltaLabel?: string;
  trend?: number[];
  /** Labels opcionales para cada punto del trend (ej dias de la semana). */
  trendLabels?: string[];
  insight?: InsightAction;
  contextualMetrics?: ContextualMetric[];
  loading?: boolean;
  className?: string;
}

/**
 * WeekStripChart — reemplaza el sparkline plano por un strip informativo.
 *
 * Muestra:
 *  - 1 mini barra vertical por dia (N dias segun trend.length)
 *  - Label de dia arriba (L M X J V S D o fechas cortas)
 *  - Valor numerico arriba de cada barra (truncado: S/342 -> "342")
 *  - Dia actual destacado con color accent + marca "HOY"
 *  - Mejor dia marcado con un dot dorado + valor en bold
 *  - Linea horizontal del promedio con label
 *  - Chip de delta "1ra mitad vs 2da mitad" para ver tendencia dentro
 *    del rango (ej: "segunda mitad +42% vs primera").
 *
 * Aporta info real: ve cuanto vendiste cada dia y comparas facil.
 */
function WeekStripChart({ data, labels }: { data: number[]; labels?: string[] }) {
  const { max, avg, maxIdx, todayIdx, displayData, halfDelta } = useMemo(() => {
    const max = Math.max(...data, 1);
    const avg = data.reduce((s, v) => s + v, 0) / Math.max(1, data.length);
    const maxIdx = data.indexOf(max);
    const todayIdx = data.length - 1;
    const defaultDays = ["L", "M", "X", "J", "V", "S", "D"];
    const displayData = data.map((value, i) => {
      const label = labels?.[i] ?? defaultDays[i % 7];
      return { value, label, isToday: i === todayIdx, isMax: i === maxIdx };
    });

    // Delta primera mitad vs segunda mitad del rango — muestra si estas
    // acelerando o desacelerando.
    const mid = Math.ceil(data.length / 2);
    const firstHalf = data.slice(0, mid);
    const secondHalf = data.slice(mid);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / Math.max(1, firstHalf.length);
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / Math.max(1, secondHalf.length);
    let halfDelta: number | null = null;
    if (firstAvg > 0 && secondHalf.length > 0) {
      halfDelta = ((secondAvg - firstAvg) / firstAvg) * 100;
    } else if (firstAvg === 0 && secondAvg > 0) {
      halfDelta = 100; // Arrancó desde cero — mostrar como crecimiento fuerte
    }

    return { max, avg, maxIdx, todayIdx, displayData, halfDelta };
  }, [data, labels]);

  const avgPct = (avg / max) * 100;

  // Formateador compacto: 4520 -> "4.5k", 342 -> "342"
  const fmt = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return n.toFixed(0);
  };

  return (
    <div className="w-full">
      {/* Header del strip — delta de mitad contra mitad */}
      {halfDelta != null && Math.abs(halfDelta) >= 5 && (
        <div className="flex justify-end mb-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-full border",
              halfDelta > 0
                ? "bg-[color:var(--section-accent,var(--data-success))]/10 text-[color:var(--section-accent,var(--data-success))] border-[color:var(--section-accent,var(--data-success))]/30"
                : "bg-[var(--data-error-50)] text-[var(--data-error-500)] border-[var(--data-error-500)]/30",
            )}
            title={
              halfDelta > 0
                ? "Estás acelerando: la segunda mitad del rango vendió más que la primera"
                : "Estás desacelerando: la segunda mitad vendió menos que la primera"
            }
          >
            {halfDelta > 0 ? "↗" : "↘"} 2da mitad {halfDelta > 0 ? "+" : ""}
            {halfDelta.toFixed(0)}% vs 1ra
          </span>
        </div>
      )}
      {/* Chart area — barras con label encima.
          Brandon mayo 2026 v2: alto subido a h-28 (era h-20), gap entre
          barras 1.5 (era 1), label de promedio movido a top-left con
          fondo sólido para no taparse con los valores de barras. */}
      <div className="relative flex items-end justify-between gap-1.5 h-28">
        {/* Linea del promedio (sutil, posicionada absoluta) */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-[var(--text-tertiary)]/40 pointer-events-none"
          style={{ bottom: `${avgPct}%` }}
          aria-hidden
        />
        {/* Pill del promedio — esquina superior izquierda fuera del chart */}
        <span
          className="absolute left-0 top-0 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums z-10"
          aria-hidden
        >
          Prom · {fmt(avg)}
        </span>

        {displayData.map((d, i) => {
          const heightPct = Math.max(6, (d.value / max) * 100);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1.5 relative group"
              title={`${d.label}: ${d.value.toLocaleString("es-PE")}`}
            >
              <span
                className={cn(
                  "text-xs font-extrabold tabular-nums leading-none",
                  d.isToday
                    ? "text-[color:var(--section-primary,var(--text-primary))]"
                    : d.isMax
                      ? "text-[var(--data-warning-500)]"
                      : "text-[var(--text-secondary)]",
                )}
              >
                {fmt(d.value)}
              </span>
              <div
                className={cn(
                  "w-full rounded-t-md transition-all",
                  d.isToday
                    ? "bg-[color:var(--section-primary,var(--text-primary))]"
                    : d.isMax
                      ? "bg-[var(--data-warning-500)] opacity-85"
                      : "bg-[var(--text-tertiary)] opacity-40 group-hover:opacity-65",
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels inferiores con etiquetas HOY / MEJOR */}
      <div className="flex items-start justify-between gap-1.5 mt-2.5">
        {displayData.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <span
              className={cn(
                "text-xs font-extrabold uppercase tracking-wider tabular-nums",
                d.isToday
                  ? "text-[color:var(--section-primary,var(--text-primary))]"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {d.label}
            </span>
            {d.isToday && (
              <span className="text-xs font-extrabold uppercase tracking-wider text-[color:var(--section-primary,var(--text-primary))]">
                hoy
              </span>
            )}
            {d.isMax && i !== todayIdx && (
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--data-warning-500)]">
                pico
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const AdminInsightCard = memo(function AdminInsightCard({
  greeting,
  heroLabel,
  heroValue,
  heroPrefix,
  heroSuffix,
  heroDecimals = 0,
  heroDelta,
  heroDeltaLabel = "vs ayer",
  trend,
  trendLabels,
  insight,
  contextualMetrics = [],
  loading = false,
  className,
}: Props) {
  const deltaUp = heroDelta != null && heroDelta > 0;
  const deltaDown = heroDelta != null && heroDelta < 0;

  const deltaColor = deltaUp
    ? "text-[var(--data-success-500)]"
    : deltaDown
      ? "text-[var(--data-error-500)]"
      : "text-[var(--text-tertiary)]";

  // sparklineTrend eliminado — reemplazado por WeekStripChart que infiere
  // el color via CSS var --section-primary.

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] overflow-hidden",
        "bg-[var(--surface-raised)]",
        className,
      )}
      aria-labelledby="admin-insight-hero"
    >
      {/* Top zone: greeting + hero KPI + sparkline.
          Brandon mayo 2026 v2: tipografía agrandada — antes greeting era
          text-2xs uppercase chiquito, ahora text-lg semibold (saludo
          legible). heroLabel sube a text-sm, heroDelta a text-base. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8 border-b border-[var(--rule-soft)]">
        {/* Hero metric — top-left más grande (F-pattern) */}
        <div className="lg:col-span-5">
          {greeting && (
            <p className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)] mb-3">
              {greeting}
            </p>
          )}
          <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            {heroLabel}
          </p>
          {loading ? (
            <div className="skeleton-v4 h-16 w-48 rounded-md" />
          ) : (
            <div className="flex items-baseline gap-1">
              {heroPrefix && (
                <span id="admin-insight-hero" className="text-2xl sm:text-3xl font-bold text-[var(--text-tertiary)]">
                  {heroPrefix}
                </span>
              )}
              <NumberFlow
                value={heroValue}
                format={{ maximumFractionDigits: heroDecimals }}
                className="text-5xl sm:text-6xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
              />
              {heroSuffix && (
                <span className="text-2xl sm:text-3xl font-bold text-[var(--text-tertiary)]">
                  {heroSuffix}
                </span>
              )}
            </div>
          )}
          {heroDelta != null && !loading && (
            <p className="mt-4 flex items-center gap-2 text-base">
              <span className={cn("inline-flex items-center gap-1 font-extrabold tabular-nums", deltaColor)}>
                {deltaUp && "↑"} {deltaDown && "↓"} {Math.abs(heroDelta).toFixed(1)}%
              </span>
              <span className="text-[var(--text-tertiary)] font-semibold">{heroDeltaLabel}</span>
            </p>
          )}
        </div>

        {/* WeekStripChart — reemplaza el sparkline plano con info real:
            mini-barras + valor por dia + HOY destacado + PICO + promedio. */}
        {trend && trend.length > 1 && !loading && (
          <div className="lg:col-span-7 flex items-end">
            <div className="w-full">
              <WeekStripChart data={trend} labels={trendLabels} />
            </div>
          </div>
        )}
      </div>

      {/* Contextual row — 3-5 métricas */}
      {contextualMetrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--rule-soft)] border-b border-[var(--rule-soft)]">
          {contextualMetrics.map((m) => {
            const dUp = m.delta != null && m.delta > 0;
            const dDown = m.delta != null && m.delta < 0;
            const statusColor =
              m.status === "success"
                ? "text-[var(--data-success-500)]"
                : m.status === "warning"
                  ? "text-[var(--data-warning-500)]"
                  : m.status === "danger"
                    ? "text-[var(--data-error-500)]"
                    : "text-[var(--text-primary)]";
            return (
              <div key={m.label} className="px-5 py-5 sm:px-7 sm:py-6">
                <p className="text-xs sm:text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2.5">
                  {m.label}
                </p>
                <div className="flex items-baseline gap-1.5">
                  {m.prefix && <span className="text-base sm:text-lg font-bold text-[var(--text-tertiary)]">{m.prefix}</span>}
                  <NumberFlow
                    value={m.value}
                    format={{ maximumFractionDigits: m.decimals ?? 0 }}
                    className={cn("text-2xl sm:text-3xl font-extrabold tabular-nums tracking-[var(--ls-tight)]", statusColor)}
                  />
                  {m.suffix && <span className="text-base font-semibold text-[var(--text-tertiary)]">{m.suffix}</span>}
                </div>
                {m.delta != null && (
                  <p className="mt-1.5 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] tabular-nums">
                    <span className={dUp ? "text-[var(--data-success-500)]" : dDown ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"}>
                      {dUp && "↑"} {dDown && "↓"} {Math.abs(m.delta).toFixed(1)}%
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Insight row — acción recomendada */}
      {insight && !loading && (
        <div
          className={cn(
            "flex items-start gap-3 p-5 sm:p-6",
            insight.type === "opportunity" && "bg-[var(--surface-sunken)]",
            insight.type === "warning" && "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
            insight.type === "info" && "bg-[var(--surface-sunken)]",
          )}
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)]">
            {insight.type === "opportunity" && <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />}
            {insight.type === "warning" && <Lightbulb className="h-5 w-5 text-[var(--data-warning-500)]" strokeWidth={2} aria-hidden />}
            {insight.type === "info" && <Lightbulb className="h-5 w-5" strokeWidth={2} aria-hidden />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
              {insight.type === "opportunity" && "Oportunidad detectada"}
              {insight.type === "warning" && "Necesita atención"}
              {insight.type === "info" && "Insight"}
            </p>
            <p className="text-base text-[var(--text-primary)] leading-relaxed font-medium">{insight.text}</p>
          </div>
          {insight.cta && (
            <PrimaryButton
              asChild
              size="md"
              className="shrink-0 rounded-full"
              rightIcon={<ArrowUpRight className="h-3 w-3" strokeWidth={2} />}
            >
              <a href={insight.cta.href} onClick={insight.cta.onClick}>
                {insight.cta.label}
              </a>
            </PrimaryButton>
          )}
        </div>
      )}
    </section>
  );
});
