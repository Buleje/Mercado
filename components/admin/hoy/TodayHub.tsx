"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle, AlertCircle, Info, Sparkles, Package } from "@buleje/design-system/icons";
import { AdminInsightCard, type ContextualMetric, type InsightAction } from "@/components/admin/ux";
import { BulejeHeatmap, type HeatmapCell } from "@/components/ui-system/charts";
import { SkeletonEditorial } from "@/components/ui-system";
import { usePersonalizedGreeting } from "@/hooks/use-personalized-greeting";
import { cn } from "@/lib/utils";

/**
 * TodayHub — pantalla unificada del admin home (ADR-064 Ola B).
 *
 * Reemplaza:
 *   - DashboardTab
 *   - SmartDashboardTab
 *   - MiNegocioHoyCard
 *   - ResumenSubTab
 *
 * 1 fetch único a /api/admin/overview. F-pattern layout:
 *   Top: Hero KPI + sparkline + contextual row
 *   Middle: Insight IA + alertas accionables
 *   Bottom: Heatmap + top products + pedidos activos
 */

interface OverviewData {
  hero: {
    totalToday: number;
    deltaVsYesterday: number;
    sparkline: number[];
  };
  contextual: {
    ordersToday: number;
    uniqueCustomers: number;
    newCustomers: number;
    ticketAverage: number;
    activeOrders: number;
    criticalStock: number;
  };
  heatmap: HeatmapCell[];
  topProducts: Array<{ productId: number | null; quantity: number }>;
  alerts: Array<{ id: string; severity: "info" | "warning" | "danger"; text: string; href?: string }>;
  insight: { type: "opportunity" | "warning" | "info"; text: string; cta?: { label: string; href: string } } | null;
  generatedAt: string;
}

interface Props {
  /** Nombre del usuario para personalizar saludo. Si omitido, usa "bodeguero". */
  userName?: string;
  /** Override manual del greeting. Si presente, ignora userName + time-of-day. */
  greeting?: string;
  className?: string;
}

export function TodayHub({ userName, greeting: greetingOverride, className }: Props) {
  const dynamicGreeting = usePersonalizedGreeting(userName ?? "bodeguero");
  const greeting = greetingOverride ?? dynamicGreeting;

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/overview");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as OverviewData;
        if (active) {
          setData(json);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
      if (active) setLoading(false);
    };

    load();
    const interval = setInterval(load, 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <SkeletonEditorial height={280} rounded="xl" />
        <div className="grid sm:grid-cols-2 gap-4">
          <SkeletonEditorial height={140} rounded="xl" />
          <SkeletonEditorial height={140} rounded="xl" />
        </div>
        <SkeletonEditorial height={320} rounded="xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className={cn(
          "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center",
          className,
        )}
      >
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          Sin datos
        </p>
        <p className="text-base font-extrabold text-[var(--text-primary)] mb-2">
          No pudimos cargar tu resumen
        </p>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
          Nos pasó algo. Recargá la página o revisá tu conexión.
        </p>
      </div>
    );
  }

  // Map contextual metrics
  const contextualMetrics: ContextualMetric[] = [
    {
      label: "Pedidos hoy",
      value: data.contextual.ordersToday,
    },
    {
      label: "Clientes únicos",
      value: data.contextual.uniqueCustomers,
    },
    {
      label: "Ticket promedio",
      value: data.contextual.ticketAverage,
      prefix: "S/ ",
      decimals: 2,
    },
    {
      label: "Stock crítico",
      value: data.contextual.criticalStock,
      status: data.contextual.criticalStock > 0 ? "warning" : undefined,
    },
  ];

  const insightAction: InsightAction | undefined = data.insight
    ? {
        type: data.insight.type,
        text: data.insight.text,
        cta: data.insight.cta,
      }
    : undefined;

  return (
    <div className={cn("space-y-4", className)}>
      {/* ── Hero unificado ── */}
      <AdminInsightCard
        greeting={greeting}
        heroLabel="Ventas de hoy"
        heroValue={data.hero.totalToday}
        heroPrefix="S/ "
        heroDecimals={2}
        heroDelta={data.hero.deltaVsYesterday}
        heroDeltaLabel="vs ayer"
        trend={data.hero.sparkline}
        contextualMetrics={contextualMetrics}
        insight={insightAction}
      />

      {/* ── Alertas accionables ── */}
      {data.alerts.length > 0 && (
        <section
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
          aria-labelledby="alerts-title"
        >
          <header className="px-5 py-3 border-b border-[var(--rule-soft)]">
            <p
              id="alerts-title"
              className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
            >
              Alertas accionables · {data.alerts.length}
            </p>
          </header>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {data.alerts.map((alert) => {
              const Icon =
                alert.severity === "danger"
                  ? AlertCircle
                  : alert.severity === "warning"
                    ? AlertTriangle
                    : Info;
              const iconColor =
                alert.severity === "danger"
                  ? "text-[var(--data-error)]"
                  : alert.severity === "warning"
                    ? "text-[var(--data-warning)]"
                    : "text-[var(--text-tertiary)]";
              return (
                <li key={alert.id}>
                  {alert.href ? (
                    <Link
                      href={alert.href}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)] transition-colors group"
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} strokeWidth={1.75} aria-hidden />
                      <span className="flex-1 text-sm text-[var(--text-primary)] font-semibold">
                        {alert.text}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-transform"
                        strokeWidth={1.75}
                      />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">
                      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} strokeWidth={1.75} aria-hidden />
                      <span className="flex-1 text-sm text-[var(--text-primary)] font-semibold">
                        {alert.text}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Heatmap ventas hora/día ── */}
      {data.heatmap.length > 0 && (
        <BulejeHeatmap
          data={data.heatmap}
          label="Cuándo venden tus clientes"
          sublabel="Últimos 30 días · hora × día"
          valueFormat={(v) => `${v} ventas`}
        />
      )}

      {/* ── Top productos ── */}
      {data.topProducts.length > 0 && (
        <section
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
          aria-labelledby="top-products-title"
        >
          <header className="px-5 py-3 border-b border-[var(--rule-soft)]">
            <p
              id="top-products-title"
              className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
            >
              Top productos · últimos 7 días
            </p>
          </header>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {data.topProducts.map((p, i) => (
              <li key={p.productId ?? i} className="flex items-center gap-3 px-5 py-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                  {i + 1}
                </span>
                <Package className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
                <span className="flex-1 text-sm text-[var(--text-primary)] font-semibold">
                  Producto #{p.productId ?? "—"}
                </span>
                <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                  {p.quantity.toLocaleString("es-PE")}
                </span>
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  unid
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Refresh timestamp */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] text-right">
        <Sparkles className="inline h-2.5 w-2.5 -mt-0.5 mr-1" strokeWidth={2} aria-hidden />
        Actualizado: {new Date(data.generatedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
