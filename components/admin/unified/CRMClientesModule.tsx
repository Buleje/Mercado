"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Users, Star, Layers, MapPin, MessageSquare,
  Maximize2, Minimize2,
} from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const AutoSegments = dynamic(() => import("@/components/admin/AutoSegments"), { loading: S });
const CustomerGeoMap = dynamic(() => import("@/components/admin/CustomerGeoMap"), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div> });
const MassMessageSender = dynamic(() => import("@/components/admin/MassMessageSender"), { loading: S });

const MODULE_ID = "clientes";

const TABS = [
  { id: "crm" as const, label: "Mis clientes", icon: Users },
  { id: "resenas" as const, label: "Opiniones", icon: Star },
  { id: "segmentos" as const, label: "Segmentos", icon: Layers },
  { id: "mapa" as const, label: "Mapa", icon: MapPin },
  { id: "mensajes" as const, label: "Mensajes masivos", icon: MessageSquare },
];

function normalizeClientesTab(savedTab: string | null): typeof TABS[number]["id"] {
  if (savedTab === "dashboard" || savedTab === "rfm") return TABS[0].id;
  return TABS.some((tab) => tab.id === savedTab) ? savedTab as typeof TABS[number]["id"] : TABS[0].id;
}

/* ─── Mapa expandible con GeoMap ─── */
function ExpandableMapSection() {
  const [maximized, setMaximized] = useState(false);

  return (
    <div className={cn("space-y-4", maximized && "fixed inset-0 z-50 bg-white dark:bg-card p-4 overflow-auto")}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700 dark:text-foreground flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" /> Ubicación de clientes
        </h3>
        <button
          onClick={() => setMaximized(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-primary/10 hover:text-primary transition-colors"
        >
          {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {maximized ? "Minimizar" : "Maximizar mapa"}
        </button>
      </div>
      <div style={{ height: maximized ? "calc(100vh - 120px)" : 520 }}>
        <CustomerGeoMap height={maximized ? "100%" : 520} />
      </div>
    </div>
  );
}

export default function CRMClientesModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return normalizeClientesTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Mis Clientes"
        description="CRM, segmentación y fidelización"
        icon={Users}
        bgTint="bg-violet-50 dark:bg-violet-900/20"
        iconColorClass="text-violet-600 dark:text-violet-400"
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof sub)}
        moduleId="crm"
      >
        {sub === "crm" && <CRMTab />}
        {sub === "resenas" && <NPSTab />}
        {sub === "segmentos" && <AutoSegments />}
        {sub === "mapa" && <ExpandableMapSection />}
        {sub === "mensajes" && <MassMessageSender />}
      </AdminTabBar>
    </div>
  );
}
