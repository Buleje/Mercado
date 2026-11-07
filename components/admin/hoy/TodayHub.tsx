"use client";

import { SkeletonEditorial } from "@/components/ui-system";
import { usePersonalizedGreeting } from "@/hooks/use-personalized-greeting";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { useTenant } from "@/contexts/tenant-context";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { algunDato } from "@/lib/admin/inicio/hay-datos";
import { HeroResumen } from "./HeroResumen";
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
        {/* Del alto del hero: debajo, InicioDashboardV2 pone su propio esqueleto. */}
        <SkeletonEditorial height={260} rounded="xl" />
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
  const venta = data.hero.totalRange ?? data.hero.totalToday ?? 0;
  const pedidos = data.contextual.ordersInRange ?? data.contextual.ordersToday ?? 0;

  // Sin ventas ni pedidos en el rango, el hero sería un muro de «S/ 0»: no se
  // dibuja. Debajo, InicioDashboardV2 muestra lo que sí se movió (compras,
  // caja) o el estado vacío del paiche si no se movió nada (Brandon 2026-10-09).
  if (!algunDato([venta, pedidos])) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <HeroResumen data={data} preset={presetKey} saludo={greeting} />

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

    </div>
  );
}
