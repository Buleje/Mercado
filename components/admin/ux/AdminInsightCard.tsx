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
  const { maxValue, maxLabel, avg, avgDelta, tendencyPct } = useMemo(() => {
    const max = Math.max(...data, 0);
    const maxIdx = data.indexOf(max);
    const avg = data.reduce((s, v) => s + v, 0) / Math.max(1, data.length);
    const defaultDays = ["L", "M", "X", "J", "V", "S", "D"];
    const maxLabel = labels?.[maxIdx] ?? defaultDays[maxIdx % 7] ?? "—";

    // Delta hoy vs ayer (último vs penúltimo)
    const today = data[data.length - 1] ?? 0;
    const yesterday = data[data.length - 2] ?? 0;
    const avgDelta = today - yesterday;

    // Tendencia: 2da mitad vs 1ra mitad del rango
    const mid = Math.ceil(data.length / 2);
    const firstHalf = data.slice(0, mid);
    const secondHalf = data.slice(mid);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / Math.max(1, firstHalf.length);
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / Math.max(1, secondHalf.length);
    let tendencyPct: number | null = null;
    if (firstAvg > 0 && secondHalf.length > 0) {
      tendencyPct = ((secondAvg - firstAvg) / firstAvg) * 100;
    } else if (firstAvg === 0 && secondAvg > 0) {
      tendencyPct = 100;
    }

    return { maxValue: max, maxLabel, avg, avgDelta, tendencyPct };
  }, [data, labels]);

  // Formateador soles: 4520 -> "S/ 4,520", 342 -> "S/ 342"
  const fmtS = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

  // Brandon mayo 2026 v4: reemplazado el strip de barras críptico (con
  // "PROM · 18", "PICO", "HOY") por 3 insights numéricos directos —
  // formato tipo "tarjeta resumen" que el dueño entiende sin mirar
  // ejes ni descifrar pills micro.
  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {/* Insight 1: Tu mejor día */}
      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
        <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
          Tu mejor día
        </p>
        <p className="text-base sm:text-lg font-extrabold text-[color:var(--data-success-500)] tabular-nums leading-tight">
          {fmtS(maxValue)}
        </p>
        <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
          {maxLabel}
        </p>
      </div>

      {/* Insight 2: Promedio por día */}
      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
        <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
          Promedio por día
        </p>
        <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">
          {fmtS(avg)}
        </p>
        {avgDelta !== 0 && (
          <p
            className={cn(
              "mt-1 text-sm font-bold tabular-nums",
              avgDelta > 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
            )}
          >
            {avgDelta > 0 ? "↑" : "↓"} {fmtS(Math.abs(avgDelta))} vs ayer
          </p>
        )}
      </div>

      {/* Insight 3: Ritmo dentro del rango.
          Brandon mayo 2026 v5: renombrado de "¿Estás creciendo?" a "Ritmo
          de los últimos días" — el título anterior contradecía visualmente
          al heroDelta del hero (ej. "↑277% vs mes pasado" arriba y
          "↘ Bajaste 90%" acá, generaba confusión). Ahora la card es
          explícita: NO compara contra el período anterior (eso es el hero),
          sino que muestra si las ventas dentro del rango actual van
          acelerando o desacelerando. */}
      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
        <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
          Ritmo últimos días
        </p>
        {tendencyPct == null ? (
          <p className="text-base sm:text-lg font-extrabold text-[var(--text-tertiary)] leading-tight">
            Sin datos
          </p>
        ) : tendencyPct >= 5 ? (
          <>
            <p className="text-base sm:text-lg font-extrabold text-[var(--data-success-500)] tabular-nums leading-tight">
              ↗ Acelerando {Math.abs(tendencyPct).toFixed(0)}%
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              los últimos días vendiste más que al inicio
            </p>
          </>
        ) : tendencyPct <= -5 ? (
          <>
            <p className="text-base sm:text-lg font-extrabold text-[var(--data-error-500)] tabular-nums leading-tight">
              ↘ Desacelerando {Math.abs(tendencyPct).toFixed(0)}%
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              los últimos días vendiste menos que al inicio
            </p>
          </>
        ) : (
          <>
            <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] leading-tight">
              Estable
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              vendiste parecido en todo el período
            </p>
          </>
        )}
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
