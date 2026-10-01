"use client";

import { useState, useEffect, useCallback } from "react";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import dynamic from "next/dynamic";
import { Truck, Users, ClipboardList, Shield, RefreshCw, MapPin, FileText, Trophy, Activity } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { RepartidoresTab } from "@/components/admin/delivery-partners/tabs/RepartidoresTab";
import { AsignacionesTab } from "@/components/admin/delivery-partners/tabs/AsignacionesTab";
import { PermisosTab } from "@/components/admin/delivery-partners/tabs/PermisosTab";
import { RankingTab } from "@/components/admin/delivery-partners/tabs/RankingTab";
import { SolicitudesTab } from "@/components/admin/delivery-partners/tabs/SolicitudesTab";

// Lazy-load del mapa Leaflet (usa window) — tab "live".
const DeliveryPartnersLiveMap = dynamic(
  () => import("@/components/admin/delivery/DeliveryPartnersLiveMap"),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center text-[var(--text-tertiary)]">Cargando mapa…</div> },
);

// Delivery en vivo (seguimiento de pedidos en ruta) — consolidado como sub-tab
// (antes era el módulo top-level "delivery-live"). No trae header propio, así
// que se renderiza bajo el header "Delivery" sin duplicar.
const DeliveryEnVivoTab = dynamic(() => import("@/components/admin/DeliveryTab"), { ssr: false, loading: () => <div className="h-[400px] flex items-center justify-center text-[var(--text-tertiary)]">Cargando…</div> });

const MODULE_ID = "delivery-partners";

const TABS = [
  { id: "live",          label: "En vivo",       icon: MapPin },
  { id: "pedidos-vivo",  label: "Pedidos en vivo", icon: Activity },
  { id: "repartidores",  label: "Repartidores",  icon: Users },
  { id: "solicitudes",   label: "Solicitudes",   icon: FileText },
  { id: "asignaciones",  label: "Asignaciones",  icon: ClipboardList },
  { id: "ranking",       label: "Ranking",        icon: Trophy },
  { id: "permisos",      label: "Permisos",       icon: Shield },
];

type TabId = string;
const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

// ─────────────────────────────────────────────
// Modal para crear/editar repartidor
// ─────────────────────────────────────────────

interface DeliveryKPIs {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}

export default function DeliveryPartnersModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=` (useVistaModulo): link compartible, «atrás» del
  // navegador y destino de avisos y del buscador. Antes era estado local y `?vista=`
  // se ignoraba (medido 2026-09-14: `?vista=` se ignoraba en 16 módulos).
  const { vista: tab, irA: setTab } = useVistaModulo<TabId>(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);
  const [, setKpis] = useState<DeliveryKPIs>({
    activePartners: 0,
    deliveriesToday: 0,
    pendingDeliveries: 0,
  });
  const [kpisLoading, setKpisLoading] = useState(true);

  const refreshKpis = useCallback(() => {
    setKpisLoading(true);
    tenantFetch("/api/delivery/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as DeliveryKPIs); })
      .catch((err) => console.warn("[DeliveryPartnersModule] /api/delivery/kpis failed:", err))
      .finally(() => setKpisLoading(false));
  }, []);

  useEffect(() => { refreshKpis(); }, [refreshKpis]);

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla; las acciones del módulo, en
          la misma banda. Recupera ~90px verticales por pantalla. */}
      <AdminTabBar
        heading={{
          title: "Delivery",
          description: "Gestiona repartidores, asignaciones y permisos.",
          icon: Truck,
          actions: (
            <>
              <button
                onClick={refreshKpis}
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
              </button>
            </>
          ),
        }}
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "live"         && <DeliveryPartnersLiveMap />}
        {tab === "pedidos-vivo" && <DeliveryEnVivoTab />}
        {tab === "repartidores" && <RepartidoresTab />}
        {tab === "solicitudes"  && <SolicitudesTab />}
        {tab === "asignaciones" && <AsignacionesTab />}
        {tab === "ranking"      && <RankingTab />}
        {tab === "permisos"     && <PermisosTab />}
      </AdminTabBar>
    </div>
  );
}
