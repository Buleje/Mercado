"use client";

import { CardTitle } from "@buleje/design-system";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Truck,
  Activity,
  AlertCircle,
  RefreshCw,
  MapPin,
  Package,
  Clock,
  Users,
  CheckCircle,
  TrendingUp,
  Maximize2,
  Minimize2,
  Home,
  Store,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { RoutesList } from "./RoutesList";
import { StopsTimeline } from "./StopsTimeline";
import { OrdenesEnVivoPanel } from "./OrdenesEnVivoPanel";
import { useDeliveryRoutes, useRouteStops, useLiveTrackingFeed } from "./hooks";
import { TRACKING_STATUS_LABELS } from "./types";
import { TRACKING_STATUS_ICON } from "./status-icons";
import { useTenant } from "@/contexts/tenant-context";

const LiveMap = dynamic(
  () => import("./LiveMap").then((m) => ({ default: m.LiveMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]">
          <MapPin className="h-8 w-8 animate-pulse" />
          <p className="text-sm font-bold">Cargando mapa…</p>
        </div>
      </div>
    ),
  },
);

type ViewMode = "split" | "map-focus";
type MobileTab = "rutas" | "mapa" | "paradas";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function DeliveryTab() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const routesState = useDeliveryRoutes();
  const stopsState = useRouteStops(selectedRouteId);
  const trackingState = useLiveTrackingFeed();
  const [feedFilter, setFeedFilter] = useState<"all" | "active" | "completed">("all");
  const { branding } = useTenant();
  const [lastUpdate, setLastUpdate] = useState<Date>(() => new Date());

  // Tick para "última actualización" — se refresca cuando cambian eventos
  useEffect(() => {
    setLastUpdate(new Date());
  }, [trackingState.events.length, routesState.routes.length]);

  // ── Layout adaptativo: si NO hay rutas, default = mapa grande sin sidebars
  const hasRoutes = routesState.routes.length > 0;
  const [viewMode, setViewMode] = useState<ViewMode>(hasRoutes ? "split" : "map-focus");
  const [mobileTab, setMobileTab] = useState<MobileTab>("mapa");

  // ── KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activeRoutes = routesState.routes.filter((r) => r.status === "in_progress");
    const planned = routesState.routes.filter((r) => r.status === "planned");
    const totalStops = routesState.routes.reduce((acc, r) => acc + r.totalStops, 0);
    const completedStops = routesState.routes.reduce((acc, r) => acc + r.completedStops, 0);
    const pendingStops = totalStops - completedStops;
    const totalKm = routesState.routes.reduce(
      (acc, r) => acc + (r.totalDistanceM ?? 0) / 1000,
      0,
    );
    const driversInRoute = new Set(activeRoutes.map((r) => r.driverId)).size;
    const completionPct = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
    return {
      activeRoutes: activeRoutes.length,
      planned: planned.length,
      totalStops,
      completedStops,
      pendingStops,
      totalKm,
      driversInRoute,
      completionPct,
    };
  }, [routesState.routes]);

  const filteredEvents = useMemo(() => {
    if (feedFilter === "all") return trackingState.events;
    if (feedFilter === "active") {
      return trackingState.events.filter((e) =>
        ["picked_up", "in_transit", "nearby", "preparing", "ready"].includes(e.status),
      );
    }
    return trackingState.events.filter((e) => ["delivered", "failed", "cancelled"].includes(e.status));
  }, [trackingState.events, feedFilter]);

  const selectedRoute = useMemo(
    () => routesState.routes.find((r) => r.id === selectedRouteId) ?? null,
    [routesState.routes, selectedRouteId],
  );

  const refreshAll = () => {
    routesState.reload();
    trackingState.reload();
    if (selectedRouteId) stopsState.reload();
  };

  // Vehicle/driver markers en el mapa: cuántos hay activos
  const driversWithLocation = trackingState.events.filter(
    (e) => e.lat != null && e.lng != null && ["in_transit", "picked_up", "nearby"].includes(e.status),
  ).length;

  // ── Subcomponente reutilizable: panel de Rutas ──────────────────
  const routesPanel = (
    <aside
      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden flex flex-col"
      aria-labelledby="routes-heading"
    >
      <div className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 shrink-0">
        <div>
          <p
            id="routes-heading"
            className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
          >
            Rutas de hoy
          </p>
          <p className="text-base font-extrabold text-[var(--text-primary)] mt-1">
            {routesState.routes.length} {routesState.routes.length === 1 ? "ruta" : "rutas"}
          </p>
        </div>
        {kpis.activeRoutes > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/30">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            {kpis.activeRoutes}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <RoutesList
          routes={routesState.routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          loading={routesState.loading}
        />
      </div>
    </aside>
  );

  // ── Subcomponente reutilizable: panel de Paradas ────────────────
  const stopsPanel = (
    <aside
      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden flex flex-col"
      aria-labelledby="stops-heading"
    >
      <div className="px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
        <p
          id="stops-heading"
          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
        >
          Paradas
        </p>
        <p className="text-base font-extrabold text-[var(--text-primary)] mt-1">
          {selectedRoute
            ? `${selectedRoute.completedStops}/${selectedRoute.totalStops} entregadas`
            : "Seleccioná una ruta"}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {selectedRouteId ? (
          <StopsTimeline
            stops={stopsState.stops}
            loading={stopsState.loading}
            onMarkStop={stopsState.markStop}
          />
        ) : (
          <div className="p-8 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
              <MapPin className="h-6 w-6 text-[var(--text-tertiary)]" />
            </span>
            <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
              Sin ruta seleccionada
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Hacé clic en una ruta para ver sus paradas con timeline.
            </p>
          </div>
        )}
      </div>
    </aside>
  );

  // ── Subcomponente: Mapa con header ──────────────────────────────
  const mapPanel = (
    <section
      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden flex flex-col"
      aria-labelledby="map-heading"
    >
      <div className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <p
              id="map-heading"
              className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
            >
              Mapa en tiempo real
            </p>
            <p className="text-base font-extrabold text-[var(--text-primary)] mt-1">
              {selectedRoute ? <>Ruta de {selectedRoute.driverName}</> : "Vista general · Pucallpa"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {driversWithLocation > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold bg-primary/10 text-primary border border-primary/30">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {driversWithLocation} en vivo
            </span>
          )}
          {stopsState.stops.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">
              <Package className="h-3.5 w-3.5" />
              {stopsState.stops.length} paradas
            </span>
          )}
          {selectedRouteId && (
            <button
              type="button"
              onClick={() => setSelectedRouteId(null)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-soft)] transition-colors"
            >
              Vista general
            </button>
          )}
          {hasRoutes && (
            <button
              type="button"
              onClick={() => setViewMode((v) => (v === "split" ? "map-focus" : "split"))}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-soft)] transition-colors"
              title={viewMode === "split" ? "Mapa amplio" : "Vista compacta"}
            >
              {viewMode === "split" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {viewMode === "split" ? "Mapa amplio" : "Compacto"}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className={cn(
        "flex-1 min-h-0 p-3 relative",
        viewMode === "map-focus" ? "h-[640px]" : "h-[640px] lg:h-auto",
      )}>
        <LiveMap
          stops={stopsState.stops}
          trackingEvents={trackingState.events}
          tenantName={branding.name}
          tenantLogoUrl={branding.logoUrl}
          primaryColor={branding.primaryColor}
        />
        {/* Leyenda flotante sobre el mapa */}
        <div className="absolute bottom-6 left-6 z-[400] bg-[var(--surface-raised)]/95 backdrop-blur border border-[var(--rule-base)] rounded-xl shadow-lg p-3 max-w-[260px]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Leyenda
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 border-2 border-primary text-xs">
                <Store className="h-3 w-3 text-primary" />
              </span>
              <span>Tu tienda</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs">
                🛵
              </span>
              <span>Repartidor en vivo</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-[var(--data-warning-500)]">
                <Home className="h-3 w-3 text-[var(--data-warning-500)]" />
              </span>
              <span>Domicilio cliente</span>
            </div>
          </div>
        </div>
        {/* Indicador "última actualización" */}
        <div className="absolute top-6 right-6 z-[400] inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-[var(--surface-raised)]/95 backdrop-blur border border-[var(--rule-base)] shadow-md text-xs font-bold text-[var(--text-secondary)]">
          <span className="h-2 w-2 rounded-full bg-[var(--data-success-500)] animate-pulse" />
          Live · {lastUpdate.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Truck className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Delivery en vivo
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {kpis.activeRoutes > 0 ? (
                  <>
                    🟢 <span className="font-bold text-[var(--text-primary)]">{kpis.activeRoutes}</span>{" "}
                    {kpis.activeRoutes === 1 ? "ruta activa" : "rutas activas"} con{" "}
                    <span className="font-bold text-[var(--text-primary)]">{kpis.driversInRoute}</span>{" "}
                    {kpis.driversInRoute === 1 ? "repartidor en calle" : "repartidores en calle"}.
                  </>
                ) : hasRoutes ? (
                  <>Hay rutas planificadas. Cuando inicien, los verás moverse en el mapa en vivo.</>
                ) : (
                  <>Sin rutas todavía. Tu mapa de Pucallpa ya está listo para mostrar repartidores en tiempo real cuando salgan.</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-bold border",
              trackingState.events.length > 0
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] border-[var(--rule-soft)]",
            )}>
              <Activity className={cn("h-4 w-4", trackingState.events.length > 0 && "animate-pulse")} />
              {trackingState.events.length} eventos
            </span>
            {trackingState.error && (
              <span className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-sm font-bold bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 text-[var(--data-error-500)]">
                <AlertCircle className="h-4 w-4" />
                Feed offline
              </span>
            )}
            <button
              type="button"
              onClick={refreshAll}
              disabled={routesState.loading}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", routesState.loading && "animate-spin")} />
              Actualizar
            </button>
          </div>
        </div>

        {/* KPIs grid — más compactos cuando no hay actividad */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Truck className="h-4 w-4 text-primary" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                En curso
              </p>
            </div>
            <p className={cn(
              "text-2xl lg:text-3xl font-extrabold tabular-nums leading-tight",
              kpis.activeRoutes > 0 ? "text-primary" : "text-[var(--text-primary)]",
            )}>
              {kpis.activeRoutes}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">Rutas activas</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                <Clock className="h-4 w-4 text-[var(--data-warning-500)]" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Planificadas
              </p>
            </div>
            <p className="text-2xl lg:text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight">
              {kpis.planned}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">Por iniciar</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Drivers
              </p>
            </div>
            <p className="text-2xl lg:text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight">
              {kpis.driversInRoute}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">En calle</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                <Package className="h-4 w-4 text-[var(--data-warning-500)]" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pendientes
              </p>
            </div>
            <p className={cn(
              "text-2xl lg:text-3xl font-extrabold tabular-nums leading-tight",
              kpis.pendingStops > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
            )}>
              {kpis.pendingStops}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">Por entregar</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <CheckCircle className="h-4 w-4 text-[var(--data-success-500)]" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Entregadas
              </p>
            </div>
            <p className="text-2xl lg:text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight">
              {kpis.completedStops}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">{kpis.completionPct}% del día</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Distancia
              </p>
            </div>
            <p className="text-2xl lg:text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight">
              {kpis.totalKm.toFixed(1)}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-bold">km hoy</p>
          </div>
        </div>
      </div>

      {/* ── 2. Mobile tabs (< lg) ──────────────────────────────────── */}
      <div className="lg:hidden bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-2">
          {(["rutas", "mapa", "paradas"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl text-sm font-bold transition-colors capitalize",
                mobileTab === t
                  ? "bg-primary text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:brightness-95",
              )}
            >
              {t === "rutas" && <Truck className="h-4 w-4" />}
              {t === "mapa" && <MapPin className="h-4 w-4" />}
              {t === "paradas" && <Package className="h-4 w-4" />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3a. Layout desktop ─────────────────────────────────────── */}
      <div className="hidden lg:block">
        {!hasRoutes || viewMode === "map-focus" ? (
          /* Mapa fullwidth alto cuando no hay rutas o se eligió "amplio" */
          <div className="space-y-4">
            {mapPanel}
            {hasRoutes && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {routesPanel}
                {stopsPanel}
              </div>
            )}
          </div>
        ) : (
          /* Layout split 3-col cuando hay rutas y modo compacto */
          <div className="grid grid-cols-[340px_1fr_360px] gap-4 h-[700px]">
            <div className="overflow-hidden">{routesPanel}</div>
            <div className="overflow-hidden">{mapPanel}</div>
            <div className="overflow-hidden">{stopsPanel}</div>
          </div>
        )}
      </div>

      {/* ── 3b. Layout mobile (tabs) ───────────────────────────────── */}
      <div className="lg:hidden">
        {mobileTab === "rutas" && <div className="h-[600px]">{routesPanel}</div>}
        {mobileTab === "mapa" && <div className="h-[500px]">{mapPanel}</div>}
        {mobileTab === "paradas" && <div className="h-[600px]">{stopsPanel}</div>}
      </div>

      {/* ── 4. Órdenes en vivo (Uber Eats style) ───────────────────── */}
      {trackingState.events.length > 0 && (
        <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Truck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Órdenes activas en mapa
                </p>
                <p className="text-base font-extrabold text-[var(--text-primary)] mt-1">
                  {new Set(trackingState.events.map((e) => e.orderId)).size} pedidos rastreados
                </p>
              </div>
            </div>
          </div>
          <div className="p-3">
            <OrdenesEnVivoPanel
              trackingEvents={trackingState.events}
              stops={stopsState.stops}
            />
          </div>
        </section>
      )}

      {/* ── 5. Feed de eventos del día ─────────────────────────────── */}
      <section
        className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden"
        aria-labelledby="feed-heading"
      >
        <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <p
                id="feed-heading"
                className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
              >
                Feed en vivo
              </p>
              <p className="text-base font-extrabold text-[var(--text-primary)] mt-1">
                {trackingState.events.length} eventos del día
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "active", "completed"] as const).map((f) => {
              const labels = { all: "Todos", active: "Activos", completed: "Cerrados" };
              const count = f === "all"
                ? trackingState.events.length
                : f === "active"
                  ? trackingState.events.filter((e) => ["picked_up", "in_transit", "nearby", "preparing", "ready"].includes(e.status)).length
                  : trackingState.events.filter((e) => ["delivered", "failed", "cancelled"].includes(e.status)).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFeedFilter(f)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                    feedFilter === f
                      ? "bg-primary text-white border-primary"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {labels[f]}
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                    feedFilter === f ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-6">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
                <Activity className="h-6 w-6 text-[var(--text-tertiary)]" />
              </span>
              <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
                Sin eventos {feedFilter !== "all" && "con este filtro"}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                {feedFilter === "all"
                  ? "Cuando inicien entregas verás los eventos en tiempo real."
                  : "Cambiá el filtro para ver otros eventos."}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="list">
              {filteredEvents.slice(0, 12).map((event) => {
                const StatusIcon = TRACKING_STATUS_ICON[event.status];
                const isActive = ["picked_up", "in_transit", "nearby", "preparing", "ready"].includes(event.status);
                const isFailed = ["failed", "cancelled"].includes(event.status);
                return (
                  <li
                    key={event.id}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      isActive
                        ? "border-primary/30 bg-primary/5"
                        : isFailed
                          ? "border-[var(--data-error-500)]/20 bg-[var(--data-error-50)]"
                          : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className={cn(
                        "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                        isActive ? "bg-primary/10 text-primary"
                        : isFailed ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                        : "bg-[var(--accent-soft)] text-[var(--data-success-500)]",
                      )}>
                        <StatusIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                      </span>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-extrabold text-[var(--text-primary)]">
                          {TRACKING_STATUS_LABELS[event.status]}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)] font-bold">
                          {relativeTime(event.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="text-base font-bold text-[var(--text-primary)] truncate">
                      {event.customerName ?? `Orden ${event.orderId.slice(-6).toUpperCase()}`}
                    </p>
                    {event.etaMinutes != null && (
                      <p className="text-sm text-[var(--text-secondary)] font-bold mt-1 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        ETA {event.etaMinutes} min
                      </p>
                    )}
                    {event.description && (
                      <p className="text-sm text-[var(--text-tertiary)] mt-1 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {filteredEvents.length > 12 && (
            <p className="text-sm text-[var(--text-tertiary)] font-bold text-center mt-4">
              Mostrando 12 de {filteredEvents.length} eventos · refrescá para ver más
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
