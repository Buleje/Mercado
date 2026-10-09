"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import type { VendorDashboardData } from "@/components/admin/vendor-dashboard/vendor-dashboard.types";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import { useMiRol } from "@/hooks/use-mi-rol";
import { CLAVE_ELIGIO_A_MANO, vistaInicialDelInicio, type VentasDelPeriodo } from "@/lib/admin/vista-inicial-inicio";
import { puedeVerInicioForestal } from "@/lib/forestal/inicio-forestal";
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { DashboardDataProvider } from "@/contexts/dashboard-data-context";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import {
  LayoutDashboard,
  RefreshCw,
  AlertTriangle,
  Store,
  ShoppingCart,
  Package,
  Truck,
  Users,
  Wallet,
  TreePine,
} from "@buleje/design-system/icons";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import DashboardDateRange, { getDefaultRange, type DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { ChartsVisibilityProvider, ChartsVisibilityButton } from "@/lib/admin/charts-visibility";
import dynamic from "next/dynamic";
import { BulejeLoader } from "@/components/admin/inicio/_shared";
import { formatTime } from "@/lib/format";

// ── Lazy-loaded components (tab-gated, not immediately visible) ─────────────
const DashboardLoading = () => <BulejeLoader variant="card" size={48} label="Cargando dashboard..." />;
// Pestaña Marketplace entera (KPIs, listas, gráficos y su vacío): 2026-10-09.
const VendorMarketplaceTab = dynamic(
  () => import("@/components/admin/vendor-dashboard/VendorMarketplaceTab").then((m) => ({ default: m.VendorMarketplaceTab })),
  { ssr: false, loading: DashboardLoading },
);
const VentasDashboard = dynamic(() => import("@/components/admin/inicio/VentasDashboard"), { ssr: false, loading: DashboardLoading });
const CajaDashboard = dynamic(() => import("@/components/admin/inicio/CajaDashboard"), { ssr: false, loading: DashboardLoading });
// Brandon mayo 2026: Productos e Inventario tenian KPIs duplicados (Valor
// Inventario, Stock Critico, Agotados, Sin Movimiento, Productos Activos).
// Se unificaron bajo la tab "Inventario". ProductosDashboard e
// InicioDashboard (v1) siguen disponibles para otros consumers pero ya
// no se montan en este modulo — la tab "general" usa V2.
const InventarioDashboard = dynamic(() => import("@/components/admin/inicio/InventarioDashboard"), { ssr: false, loading: DashboardLoading });
const ComprasDashboard = dynamic(() => import("@/components/admin/inicio/ComprasDashboard"), { ssr: false, loading: DashboardLoading });
const ClientesDashboard = dynamic(() => import("@/components/admin/inicio/ClientesDashboard"), { ssr: false, loading: DashboardLoading });
// 2026-10-08 (N7): el aserradero y la plantación en el Inicio. Sólo si el negocio usa los libros forestales.
const ForestalDashboard = dynamic(() => import("@/components/admin/inicio/ForestalDashboard"), { ssr: false, loading: DashboardLoading });
// Brandon 2026-06-07 (idea #2): tarjeta "Tu tienda pública" — puente admin↔tienda.
const StorePublicCard = dynamic(() => import("@/components/admin/inicio/StorePublicCard"), { ssr: false });

// ADR-064 Ola B — TodayHub hero unificado (drop-in al tab "general")
const TodayHub = dynamic(
  () => import("@/components/admin/hoy/TodayHub").then((m) => ({ default: m.TodayHub })),
  { ssr: false, loading: DashboardLoading },
);

// ADR-066 Ola M — InicioDashboardV2 con compound charts + multi-signal KPIs
const InicioDashboardV2 = dynamic(
  () => import("@/components/admin/inicio/InicioDashboardV2"),
  { ssr: false, loading: DashboardLoading },
);

// 2026-05-26 — briefing accionable embebido (reemplaza el modal "¡Buenos días!"
// bloqueante). Solo aparece si hay fiados/stock/pedidos por resolver.
const MorningBriefingCard = dynamic(
  () => import("@/components/admin/inicio/MorningBriefingCard"),
  { ssr: false },
);

const MODULE_ID = "vendor-dashboard";

type InicioTab = "general" | "forestal" | "ventas" | "caja" | "inventario" | "compras" | "clientes" | "marketplace";
const INICIO_TABS: readonly InicioTab[] = ["general", "forestal", "ventas", "caja", "inventario", "compras", "clientes", "marketplace"];

// ── Prefetch map: preload tab chunks on hover ──────────────────────────────
const TAB_PREFETCH: Record<InicioTab, () => void> = {
  general:     () => { void import("@/components/admin/inicio/InicioDashboardV2"); },
  forestal:    () => { void import("@/components/admin/inicio/ForestalDashboard"); },
  ventas:      () => { void import("@/components/admin/inicio/VentasDashboard"); },
  caja:        () => { void import("@/components/admin/inicio/CajaDashboard"); },
  inventario:  () => { void import("@/components/admin/inicio/InventarioDashboard"); },
  compras:     () => { void import("@/components/admin/inicio/ComprasDashboard"); },
  clientes:    () => { void import("@/components/admin/inicio/ClientesDashboard"); },
  marketplace: () => { void import("@/components/admin/unified/MarketplaceModule"); },
};

const TABS: AdminTab[] = [
  { id: "general",     label: "Resumen",     icon: LayoutDashboard },
  { id: "forestal",    label: "Forestal",    icon: TreePine },
  { id: "ventas",      label: "Ventas",      icon: ShoppingCart },
  { id: "caja",        label: "Caja",        icon: Wallet },
  { id: "inventario",  label: "Inventario",  icon: Package },
  { id: "compras",     label: "Compras",     icon: Truck },
  { id: "clientes",    label: "Clientes",    icon: Users },
  { id: "marketplace", label: "Marketplace", icon: Store },
];

// Mapea cada sub-tab del Inicio al módulo del que depende. Si el negocio NO
// tiene ese módulo (plan no lo incluye o plantilla lo ocultó), el sub-tab y su
// dashboard se ocultan automáticamente (Brandon 2026-05-29: "que inicio sea
// referente a lo que tengo"). "general" (Resumen) no depende de un módulo.
const SUBTAB_MODULE: Partial<Record<string, Tab>> = {
  ventas: "ventas-caja",
  caja: "ventas-caja",
  inventario: "inventario",
  compras: "compras",
  clientes: "clientes",
  marketplace: "marketplace",
};

const REFRESH_INTERVAL_MS = 30_000;

export default function VendorDashboardModule() {
  const [data, setData] = useState<VendorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // La sub-vista vive en `?vista=` (useVistaModulo): link compartible, «atrás» del
  // navegador y destino de avisos y del buscador. Antes era estado local y `?vista=`
  // se ignoraba (medido 2026-09-14: `?vista=` se ignoraba en 16 módulos).
  const { vista: tab, irA: setTab } = useVistaModulo<InicioTab>(MODULE_ID, INICIO_TABS, "general");
  const [storeSlug, setStoreSlug] = useState("main");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  // ── Inicio referente a lo que el negocio TIENE (Brandon 2026-05-29) ──
  // Cada sub-tab depende de un módulo; si el negocio no lo tiene (plan o
  // plantilla), el sub-tab + su dashboard se ocultan automáticamente.
  const { hasTab } = usePlanTier();
  const { isHiddenByTemplate } = useAdminTemplateOverlay();
  const moduleAvailable = useCallback(
    (m?: Tab) => !m || (hasTab(m) && !isHiddenByTemplate(m)),
    [hasTab, isHiddenByTemplate],
  );
  // «Forestal» no depende del plan sino de la especialización del negocio
  // (ADR-124, la misma bandera que prende los libros en el menú): una bodega
  // sin libros forestales no la ve.
  const { enabledModuleIds, isLoading: cargandoSpecs } = useEnabledSpecs();
  const rol = useMiRol();
  const tieneForestal =
    (enabledModuleIds.has("ctp-libro-operaciones") || enabledModuleIds.has("loth-libro-operaciones")) &&
    puedeVerInicioForestal(rol);
  const availableTabs = useMemo(
    () =>
      TABS.filter((t) =>
        t.id === "forestal" ? tieneForestal : moduleAvailable(SUBTAB_MODULE[t.id]),
      ),
    [moduleAvailable, tieneForestal],
  );
  // Si el sub-tab activo dejó de estar disponible, volver a Resumen. Mientras
  // las especializaciones cargan, «Forestal» todavía no se sabe: un link con
  // `?vista=forestal` no tiene que rebotar a Resumen por llegar antes.
  // Pestaña por defecto (N24): negocio forestal sin ventas en el período abre en
  // «Forestal». Lo elegido a mano (click o ?vista=) manda; ver `vista-inicial-inicio`.
  // Sin consultas nuevas: el Resumen ya pide /api/admin/overview y avisa el resultado.
  const [ventas, setVentas] = useState<VentasDelPeriodo>("desconocido");
  const vistaEnUrlRef = useRef<boolean | null>(null);
  if (vistaEnUrlRef.current === null && typeof window !== "undefined") {
    vistaEnUrlRef.current = new URLSearchParams(window.location.search).has("vista");
  }
  const eligioAMano = useRef(false);
  const yaDecidida = useRef(false);
  useEffect(() => {
    try { eligioAMano.current = localStorage.getItem(CLAVE_ELIGIO_A_MANO) === "1"; } catch { /* sin memoria */ }
  }, []);
  useEffect(() => {
    if (yaDecidida.current || cargandoSpecs || rol == null) return;
    const destino = vistaInicialDelInicio({
      vistaActual: tab,
      vistaEnUrl: vistaEnUrlRef.current === true,
      eligioAMano: eligioAMano.current,
      tieneForestal,
      ventas,
    });
    if (destino) {
      yaDecidida.current = true;
      setTab(destino);
    }
  }, [tab, tieneForestal, ventas, cargandoSpecs, rol, setTab]);
  const elegirPestana = useCallback((t: string) => {
    eligioAMano.current = true;
    try { localStorage.setItem(CLAVE_ELIGIO_A_MANO, "1"); } catch { /* sin memoria */ }
    setTab(t as InicioTab);
  }, [setTab]);

  useEffect(() => {
    if (tab === "forestal" && (cargandoSpecs || rol == null)) return;
    if (!availableTabs.some((t) => t.id === tab)) setTab("general");
  }, [availableTabs, tab, setTab, cargandoSpecs, rol]);

  useEffect(() => {
    let active = true;
    void resolveActiveTenantSlug().then((resolved: string) => {
      if (active && resolved) setStoreSlug(resolved);
    });
    return () => { active = false; };
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/vendor/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const json = (await res.json()) as VendorDashboardData;
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el panel");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "marketplace") return;
    void fetchDashboard(false);
  }, [fetchDashboard, tab]);

  // Brandon 2026-05-16 (audit P1): agregado visibility guard. Antes pollée
  // cada REFRESH_INTERVAL_MS aunque la pestaña estuviera oculta, gastando
  // red/CPU sin razón. Patrón espejo de MetasLogrosModule:248-263.
  useEffect(() => {
    if (tab !== "marketplace") return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(() => { void fetchDashboard(true); }, REFRESH_INTERVAL_MS); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    if (typeof document !== "undefined" && document.visibilityState === "visible") start();
    const onVis = () => {
      if (document.visibilityState === "visible") { void fetchDashboard(true); start(); }
      else stop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchDashboard, tab]);

  const rangeLabel: Record<string, string> = {
    diario: "de hoy",
    semanal: "de la semana",
    mensual: "del mes",
    anual: "del año",
    personalizado: "del período",
  };
  const rangeTxt = rangeLabel[dateRange.preset] ?? "del período";

  const TAB_DESCRIPTIONS: Record<InicioTab, string> = {
    general: `Resumen ${rangeTxt} con KPIs, ventas, caja, inventario y clientes vinculados.`,
    forestal: `Aserradero y plantación ${rangeTxt}.`,
    ventas: `Ventas ${rangeTxt}: tendencias, tickets y top productos.`,
    caja: `Movimientos de caja ${rangeTxt}: ingresos, egresos y flujo.`,
    inventario: `Inventario y catálogo ${rangeTxt}: stock crítico, rotación, agotados y unidades vendidas.`,
    compras: `Compras ${rangeTxt}: proveedores, deudas y órdenes.`,
    clientes: `Clientes ${rangeTxt}: nuevos, recurrentes y ticket promedio.`,
    marketplace: lastUpdated
      ? `Marketplace actualizado a las ${formatTime(lastUpdated)}`
      : "Panel consolidado del canal marketplace.",
  };

  return (
    <DashboardDataProvider>
    {/* ChartsVisibilityProvider envuelve el módulo: cada tab tiene su propio
        scope porque cambiamos moduleId con la tab activa. localStorage
        persiste prefs por tab. */}
    <ChartsVisibilityProvider moduleId={`vendor-dashboard:${tab}`} key={tab}>
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla; las acciones del módulo, en
          la misma banda. Recupera ~90px verticales por pantalla. */}
      <AdminTabBar
        heading={{
          title: "Inicio",
          description: TAB_DESCRIPTIONS[tab],
          icon: LayoutDashboard,
          actions: (
            <>
              {tab !== "marketplace" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <ChartsVisibilityButton />
                  <DashboardDateRange value={dateRange} onChange={setDateRange} />
                </div>
              )}
              {tab === "marketplace" && (
                <div className="flex items-center gap-2">
                  <ChartsVisibilityButton />
                  <button
                    onClick={() => void fetchDashboard(false)}
                    disabled={loading}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] disabled:opacity-50"
                    title="Actualizar marketplace"
                    aria-label="Actualizar datos del marketplace"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}
            </>
          ),
        }}
        tabs={availableTabs}
        activeTab={tab}
        onTabChange={elegirPestana}
        onTabHover={(id) => TAB_PREFETCH[id as InicioTab]?.()}
        moduleId={MODULE_ID}
      >
        {tab === "general" && (
          <div className="space-y-4">
            {/* Brandon 2026-06-07 (idea #2): puente admin ↔ tienda pública —
                ver / compartir / editar la portada del storefront. */}
            <StorePublicCard storeSlug={storeSlug} />
            {/* Brandon 2026-06-01 (dedup Resumen): se quitó VendorCommandCenter
                de acá — duplicaba el saludo ("Buenas noches") y las cifras de
                ventas (INGRESOS/GANANCIA) que ya muestran TodayHub e
                InicioDashboardV2. Flujo limpio: hero (un solo saludo + KPIs) →
                accionable → analítica profunda, sin repetir "ventas". */}
            {/* 1) Hero "Hoy" — saludo dinámico + hero KPI multi-señal del rango.
                   hideAlerts=true porque InicioDashboardV2 las renderea junto a
                   la Meta del mes. Es el ÚNICO saludo del Resumen. */}
            <TodayHub dateRange={dateRange} hideAlerts />
            {/* 2) Briefing accionable del día — se auto-oculta si no hay nada
                   que resolver (pedidos pendientes, fiados, stock). */}
            <MorningBriefingCard />
            {/* 3) Dashboard denso: meta del mes + compound charts. Su hero se
                   removió para complementar a TodayHub (no duplica KPIs). */}
            <InicioDashboardV2 dateRange={dateRange} onChangeRange={setDateRange} onSinVentas={(sin) => setVentas(sin ? "sin" : "con")} />
          </div>
        )}
        {tab === "forestal" && tieneForestal && (
          <ForestalDashboard dateRange={dateRange} conAdelantos={moduleAvailable("adelantos")} />
        )}
        {tab === "ventas" && <VentasDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "caja" && <CajaDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "inventario" && <InventarioDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "compras" && <ComprasDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "clientes" && <ClientesDashboard dateRange={dateRange} onChangeRange={setDateRange} />}

        {tab === "marketplace" && (
          <div className="space-y-6">
            {error && !data && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
                <p className="text-sm font-medium text-[var(--text-primary)] text-center">{error}</p>
                <button
                  onClick={() => void fetchDashboard(false)}
                  className="inline-flex items-center gap-2 px-4 min-h-11 rounded-xl bg-[var(--accent-dark)] text-white text-sm font-semibold hover:bg-[var(--accent-600)] transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Reintentar
                </button>
              </div>
            )}

            {loading && !data && (
              <BulejeLoader variant="card" size={56} label="Cargando marketplace..." />
            )}

            {/* Con datos ya cargados, «Actualizar» no deja la pestaña en blanco: el giro va en el botón. */}
            {data && <VendorMarketplaceTab data={data} storeSlug={storeSlug} />}
          </div>
        )}
      </AdminTabBar>
    </div>
    </ChartsVisibilityProvider>
    </DashboardDataProvider>
  );
}