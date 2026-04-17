"use client";

import { memo } from "react";
import { Sparkles, ArrowUpRight, Lightbulb } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@buleje/design-system";
import { BulejeSparkline } from "@/components/ui-system/charts";

/**
 * AdminInsightCard — hero card "Hoy" del admin.
 *
 * Patrón F-pattern de research 2026: hero KPI top-left, más grande.
 * 3-5 contextual metrics debajo. Un insight accionable al final
 * (Cialdini commitment — "ya detectamos X, probá Y").
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
  insight?: InsightAction;
  contextualMetrics?: ContextualMetric[];
  loading?: boolean;
  className?: string;
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
  insight,
  contextualMetrics = [],
  loading = false,
  className,
}: Props) {
  const deltaUp = heroDelta != null && heroDelta > 0;
  const deltaDown = heroDelta != null && heroDelta < 0;

  const deltaColor = deltaUp
    ? "text-[var(--data-success)]"
    : deltaDown
      ? "text-[var(--data-error)]"
      : "text-[var(--text-tertiary)]";

  const sparklineTrend = deltaUp ? "up" : deltaDown ? "down" : "neutral";

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] overflow-hidden",
        "bg-[var(--surface-raised)]",
        className,
      )}
      aria-labelledby="admin-insight-hero"
    >
      {/* Top zone: greeting + hero KPI + sparkline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8 border-b border-[var(--rule-soft)]">
        {/* Hero metric — top-left más grande (F-pattern) */}
        <div className="lg:col-span-5">
          {greeting && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
              {greeting}
            </p>
          )}
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
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
            <p className="mt-3 flex items-center gap-2 text-xs">
              <span className={cn("inline-flex items-center gap-0.5 font-bold tabular-nums", deltaColor)}>
                {deltaUp && "↑"} {deltaDown && "↓"} {Math.abs(heroDelta).toFixed(1)}%
              </span>
              <span className="text-[var(--text-tertiary)]">{heroDeltaLabel}</span>
            </p>
          )}
        </div>

        {/* Sparkline trend — top-right */}
        {trend && trend.length > 1 && !loading && (
          <div className="lg:col-span-7 flex items-end justify-end">
            <div className="w-full max-w-sm">
              <BulejeSparkline data={trend} trend={sparklineTrend} width="100%" height={64} strokeWidth={2} />
              <div className="flex justify-between mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums">
                <span>Hace 7 días</span>
                <span>Hoy</span>
              </div>
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
                ? "text-[var(--data-success)]"
                : m.status === "warning"
                  ? "text-[var(--data-warning)]"
                  : m.status === "danger"
                    ? "text-[var(--data-error)]"
                    : "text-[var(--text-primary)]";
            return (
              <div key={m.label} className="px-4 py-4 sm:px-6 sm:py-5">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                  {m.label}
                </p>
                <div className="flex items-baseline gap-1">
                  {m.prefix && <span className="text-sm font-bold text-[var(--text-tertiary)]">{m.prefix}</span>}
                  <NumberFlow
                    value={m.value}
                    format={{ maximumFractionDigits: m.decimals ?? 0 }}
                    className={cn("text-2xl font-extrabold tabular-nums tracking-[var(--ls-tight)]", statusColor)}
                  />
                  {m.suffix && <span className="text-sm font-semibold text-[var(--text-tertiary)]">{m.suffix}</span>}
                </div>
                {m.delta != null && (
                  <p className="mt-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] tabular-nums">
                    <span className={dUp ? "text-[var(--data-success)]" : dDown ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}>
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
            insight.type === "warning" && "bg-amber-50 dark:bg-amber-950/30",
            insight.type === "info" && "bg-[var(--surface-sunken)]",
          )}
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]">
            {insight.type === "opportunity" && <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
            {insight.type === "warning" && <Lightbulb className="h-4 w-4 text-amber-600" strokeWidth={1.75} aria-hidden />}
            {insight.type === "info" && <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {insight.type === "opportunity" && "Oportunidad detectada"}
              {insight.type === "warning" && "Necesita atención"}
              {insight.type === "info" && "Insight"}
            </p>
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{insight.text}</p>
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
