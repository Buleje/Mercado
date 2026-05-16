"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle, AlertCircle, Info, Sparkles, Package } from "@buleje/design-system/icons";
import { AdminInsightCard, type ContextualMetric, type InsightAction } from "@/components/admin/ux";
import { BulejeHeatmap, type HeatmapCell } from "@/components/ui-system/charts";
import { SkeletonEditorial } from "@/components/ui-system";
import { usePersonalizedGreeting } from "@/hooks/use-personalized-greeting";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";

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
    totalToday: number;        // legacy
    totalRange?: number;
    deltaVsYesterday: number;  // legacy
    deltaVsPrevious?: number;
    sparkline: number[];
    sparklineLabels?: string[];
    sparklineIso?: string[];
  };
  contextual: {
    ordersToday: number;  // legacy
    ordersInRange?: number;
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
  /** Rango activo del dashboard. Si se omite, se asume "hoy". */
  dateRange?: DateRange;
  /**
   * Si true, NO renderiza el bloque "Alertas accionables" interno. Útil
   * cuando otro componente externo (ej. InicioDashboardV2) las renderiza
   * en un layout side-by-side con la Meta del mes.
   */
  hideAlerts?: boolean;
  className?: string;
}

const PRESET_HERO_LABEL: Record<string, string> = {
  diario: "Ventas de hoy",
  semanal: "Ventas de la semana",
  mensual: "Ventas del mes",
  anual: "Ventas del año",
  personalizado: "Ventas del período",
};

const PRESET_DELTA_LABEL: Record<string, string> = {
  diario: "vs ayer",
  semanal: "vs semana pasada",
  mensual: "vs mes pasado",
  anual: "vs año pasado",
  personalizado: "vs período anterior",
};

const PRESET_ORDERS_LABEL: Record<string, string> = {
  diario: "Pedidos hoy",
  semanal: "Pedidos de la semana",
  mensual: "Pedidos del mes",
  anual: "Pedidos del año",
  personalizado: "Pedidos del período",
};

export function TodayHub({ userName, greeting: greetingOverride, dateRange, hideAlerts = false, className }: Props) {
  // Brandon mayo 2026 v4: si no se pasa userName, usamos el nombre del
  // negocio en lugar de "bodeguero" — "Buenas tardes, Mi Pollo" se siente
  // más personal y refuerza la marca propia del dueño.
  const { brand } = usePlatformBrand();
  const businessName = brand?.identity.name?.trim() || "bodeguero";
  const dynamicGreeting = usePersonalizedGreeting(userName ?? businessName);
  const greeting = greetingOverride ?? dynamicGreeting;

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Query string estable para el rango — re-fetch cuando cambia
  const rangeQuery = useMemo(() => {
    if (!dateRange) return "";
    const params = new URLSearchParams();
    params.set("from", dateRange.from.toISOString());
    params.set("to", dateRange.to.toISOString());
    params.set("preset", dateRange.preset);
    return `?${params.toString()}`;
  }, [dateRange?.from, dateRange?.to, dateRange?.preset]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/admin/overview${rangeQuery}`);
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
  }, [rangeQuery]);

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
          Nos pasó algo. Recargá la página o revisa tu conexión.
        </p>
      </div>
    );
  }

  const presetKey = dateRange?.preset ?? "diario";
  const heroLabel = PRESET_HERO_LABEL[presetKey] ?? PRESET_HERO_LABEL.diario;
  const deltaLabel = PRESET_DELTA_LABEL[presetKey] ?? PRESET_DELTA_LABEL.diario;
  const ordersLabel = PRESET_ORDERS_LABEL[presetKey] ?? PRESET_ORDERS_LABEL.diario;

  const heroValue = data.hero.totalRange ?? data.hero.totalToday ?? 0;
  const heroDelta = data.hero.deltaVsPrevious ?? data.hero.deltaVsYesterday ?? 0;
  const ordersValue = data.contextual.ordersInRange ?? data.contextual.ordersToday ?? 0;

  // Map contextual metrics
  const contextualMetrics: ContextualMetric[] = [
    {
      label: ordersLabel,
      value: ordersValue,
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
        heroLabel={heroLabel}
        heroValue={heroValue}
        heroPrefix="S/ "
        heroDecimals={2}
        heroDelta={heroDelta}
        heroDeltaLabel={deltaLabel}
        trend={data.hero.sparkline}
        trendLabels={data.hero.sparklineLabels}
        contextualMetrics={contextualMetrics}
        insight={insightAction}
      />

      {/* ── Alertas accionables ── */}
      {!hideAlerts && data.alerts.length > 0 && (
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
                  ? "text-[var(--data-error-500)]"
                  : alert.severity === "warning"
                    ? "text-[var(--data-warning-500)]"
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

      {/* Heatmap "Cuándo venden" y "Top productos últimos 7 días" removidos
          — migran al módulo de gráficos individuales. El resumen del admin
          solo muestra charts de alto nivel. */}

      {/* Refresh timestamp */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] text-right">
        <Sparkles className="inline h-2.5 w-2.5 -mt-0.5 mr-1" strokeWidth={2} aria-hidden />
        Actualizado: {new Date(data.generatedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

/**
 * DashboardAlertsList — sub-componente standalone que muestra el bloque
 * "Alertas accionables" del mismo endpoint /api/admin/overview. Se usa en
 * InicioDashboardV2 al lado de "Meta del mes" para tenerlas en 1 fila.
 *
 * Hace su propio fetch (60s polling) — el costo es leve y evita acoplar
 * componentes vía props o context complicado.
 */
export function DashboardAlertsList({ dateRange, className }: { dateRange?: DateRange; className?: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  // Disable react-hooks/preserve-manual-memoization: same pattern que el
  // TodayHub principal — el optional chaining en deps hace que React
  // Compiler no pueda preservar la memoización, pero es intencional para
  // evitar re-fetch cuando dateRange cambia de referencia pero no de valor.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const rangeQuery = useMemo(() => {
    if (!dateRange) return "";
    const params = new URLSearchParams();
    params.set("from", dateRange.from.toISOString());
    params.set("to", dateRange.to.toISOString());
    params.set("preset", dateRange.preset);
    return `?${params.toString()}`;
  }, [dateRange?.from, dateRange?.to, dateRange?.preset]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/overview${rangeQuery}`);
        if (!res.ok) return;
        const json = (await res.json()) as OverviewData;
        if (active) setData(json);
      } catch { /* silent */ }
    };
    void load();
    const interval = setInterval(() => void load(), 60 * 1000);
    return () => { active = false; clearInterval(interval); };
  }, [rangeQuery]);

  if (!data || data.alerts.length === 0) {
    return (
      <section
        className={cn(
          "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 h-full flex flex-col",
          className,
        )}
        aria-labelledby="alerts-empty-title"
      >
        <p
          id="alerts-empty-title"
          className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 inline-flex items-center gap-2"
        >
          <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Alertas accionables
        </p>
        <div className="flex-1 flex items-center justify-center text-center py-4">
          <p className="text-base font-semibold text-[var(--text-secondary)]">
            Sin alertas. Todo en orden.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden h-full flex flex-col"
      aria-labelledby="alerts-side-title"
    >
      <header className="px-5 sm:px-6 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between gap-3 shrink-0">
        <p
          id="alerts-side-title"
          className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] inline-flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 text-[var(--data-warning-500)]" strokeWidth={2.5} aria-hidden />
          Alertas accionables
        </p>
        <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] text-xs font-extrabold tabular-nums">
          {data.alerts.length}
        </span>
      </header>
      <ul className="flex-1 divide-y divide-[var(--rule-soft)] overflow-y-auto max-h-64">
        {data.alerts.map((alert) => {
          const Icon =
            alert.severity === "danger"
              ? AlertCircle
              : alert.severity === "warning"
                ? AlertTriangle
                : Info;
          const iconColor =
            alert.severity === "danger"
              ? "text-[var(--data-error-500)]"
              : alert.severity === "warning"
                ? "text-[var(--data-warning-500)]"
                : "text-[var(--text-tertiary)]";
          return (
            <li key={alert.id}>
              {alert.href ? (
                <Link
                  href={alert.href}
                  className="flex items-center gap-3 px-5 sm:px-6 py-3.5 hover:bg-[var(--surface-sunken)] transition-colors group"
                >
                  <Icon className={cn("h-5 w-5 shrink-0", iconColor)} strokeWidth={2} aria-hidden />
                  <span className="flex-1 text-sm sm:text-base text-[var(--text-primary)] font-semibold leading-snug">
                    {alert.text}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-0.5 transition-transform"
                    strokeWidth={2}
                  />
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-5 sm:px-6 py-3.5">
                  <Icon className={cn("h-5 w-5 shrink-0", iconColor)} strokeWidth={2} aria-hidden />
                  <span className="flex-1 text-sm sm:text-base text-[var(--text-primary)] font-semibold leading-snug">
                    {alert.text}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
