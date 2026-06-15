"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Truck, Users, ClipboardList, Shield, RefreshCw, MapPin, FileText, Trophy } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
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

const MODULE_ID = "delivery-partners";

const TABS = [
  { id: "live",          label: "En vivo",       icon: MapPin },
  { id: "repartidores",  label: "Repartidores",  icon: Users },
  { id: "solicitudes",   label: "Solicitudes",   icon: FileText },
  { id: "asignaciones",  label: "Asignaciones",  icon: ClipboardList },
  { id: "ranking",       label: "Ranking",        icon: Trophy },
  { id: "permisos",      label: "Permisos",       icon: Shield },
];

type TabId = string;

// ─────────────────────────────────────────────
// Modal para crear/editar repartidor
// ─────────────────────────────────────────────

interface DeliveryKPIs {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}

export default function DeliveryPartnersModule() {
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const [kpis, setKpis] = useState<DeliveryKPIs>({
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
      <AdminModuleHeader
        title="Delivery"
        description="Gestiona repartidores, asignaciones y permisos"
        icon={Truck}
      >
        <button
          onClick={refreshKpis}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "live"         && <DeliveryPartnersLiveMap />}
        {tab === "repartidores" && <RepartidoresTab />}
        {tab === "solicitudes"  && <SolicitudesTab />}
        {tab === "asignaciones" && <AsignacionesTab />}
        {tab === "ranking"      && <RankingTab />}
        {tab === "permisos"     && <PermisosTab />}
      </AdminTabBar>
    </div>
  );
}
