"use client";

import type { MouseEvent } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import { AdminInsightCard, type ContextualMetric, type InsightAction } from "@/components/admin/ux";
import { SkeletonEditorial } from "@/components/ui-system";
import { usePersonalizedGreeting } from "@/hooks/use-personalized-greeting";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { useTenant } from "@/contexts/tenant-context";
import { cn } from "@/lib/utils";
import { irEnElPanel } from "@/lib/admin/ir-en-el-panel";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { formatTime } from "@/lib/format";
import { ListaDeAlertas } from "./ListaDeAlertas";
import { useOverview } from "./use-overview";

// La columna de avisos de Inicio vive en su archivo; se re-exporta acá porque
// InicioDashboardV2 la importa desde este módulo.
export { DashboardAlertsList } from "./DashboardAlertsList";

/**
 * TodayHub — pantalla unificada del admin home (ADR-064 Ola B).
 *
 * Reemplaza:
 *   - DashboardTab
 *   - SmartDashboardTab
 *   - MiNegocioHoyCard
 *   - ResumenSubTab
 *
 * 1 fetch único a /api/admin/overview (`useOverview`). F-pattern layout:
 *   Top: Hero KPI + sparkline + contextual row
 *   Middle: Insight IA + alertas accionables
 *   Bottom: Heatmap + top products + pedidos activos
 */

// El contrato del endpoint vive en `lib/admin/overview-tipos.ts` (lo arma la
// ruta, lo dibujan TodayHub y la columna de avisos).

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

/**
 * «Ver cuáles» del consejo: cambia de módulo sin recargar la página entera.
 * `AdminInsightCard` tipa `cta.onClick` como `() => void` pero lo pasa tal cual
 * al `<a href>`, así que React le da el evento (el parámetro es opcional para
 * que el tipo encaje).
 */
function irDesdeElConsejo(e?: MouseEvent<HTMLAnchorElement>): void {
  if (e) irEnElPanel(e);
}

export function TodayHub({ userName, greeting: greetingOverride, dateRange, hideAlerts = false, className }: Props) {
  // Brandon mayo 2026 v4: si no se pasa userName, usamos el nombre del
  // negocio — "Buenas tardes, Mi Pollo" se siente más personal.
  // Fix 2026-05-25: priorizar el nombre del TENANT (tienda real) sobre el de
  // la plataforma ("Buleje"), que aparecía como saludo en todos los admin.
  const { brand } = usePlatformBrand();
  const { branding } = useTenant();
  const businessName = branding?.name?.trim() || brand?.identity.name?.trim() || "tu negocio";
  const dynamicGreeting = usePersonalizedGreeting(userName ?? businessName);
  const greeting = greetingOverride ?? dynamicGreeting;

  const { data, loading, error } = useOverview(dateRange);

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
          Nos pasó algo. Recarga la página o revisa tu conexión.
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
      // El mismo número que el «Bajo stock» de Inventario (en su mínimo o agotado).
      label: "Bajo stock",
      value: data.contextual.criticalStock,
      status: data.contextual.criticalStock > 0 ? "warning" : undefined,
    },
  ];

  const insightAction: InsightAction | undefined = data.insight
    ? {
        type: data.insight.type,
        text: data.insight.text,
        cta: data.insight.cta ? { ...data.insight.cta, onClick: irDesdeElConsejo } : undefined,
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
          <ListaDeAlertas alerts={data.alerts} tamano="compacto" />
        </section>
      )}

      {/* Heatmap "Cuándo venden" y "Top productos últimos 7 días" removidos
          — migran al módulo de gráficos individuales. El resumen del admin
          solo muestra charts de alto nivel. */}

      {/* Refresh timestamp */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] text-right">
        <Sparkles className="inline h-2.5 w-2.5 -mt-0.5 mr-1" strokeWidth={2} aria-hidden />
        Actualizado: {formatTime(data.generatedAt)}
      </p>
    </div>
  );
}
