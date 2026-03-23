"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Brain, MessageSquare, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const SmartDashboardTab = dynamic(
  () => import("@/components/admin/SmartDashboardTab"),
  { loading: S },
);
const AIAssistant = dynamic(
  () => import("@/components/admin/AIAssistant"),
  { ssr: false, loading: S },
);
const AlertsCenterTab = dynamic(
  () => import("@/components/admin/AlertsCenterTab"),
  { loading: S },
);

const TABS = [
  { id: "dashboard-ia", label: "Mi negocio hoy", icon: Brain },
  { id: "chat-ia", label: "Chat", icon: MessageSquare },
  { id: "alertas", label: "Alertas", icon: Bell },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  tenantId?: string;
}

export default function AsistenteIAModule({ tenantId }: Props) {
  const [tab, setTab] = useState<TabId>("dashboard-ia");
  const [bannerVisible, setBannerVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("banner-asistente");
    if (stored === "hidden") setBannerVisible(false);
  }, []);
  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-asistente", next ? "visible" : "hidden");
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {bannerVisible && (
        <button onClick={toggleBanner} className="w-full text-left bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#2d6a4f]/10">
          <p className="text-sm text-[#2d6a4f] dark:text-emerald-400">
            <span className="font-semibold">Asistente</span> — Aquí ves el resumen de tu negocio del día, puedes chatear con la IA y revisar alertas importantes.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button onClick={toggleBanner} className="text-xs text-gray-400 hover:text-[#2d6a4f] transition-colors">
          Mostrar descripción
        </button>
      )}
      {/* Tab bar — pill style, scrollable on mobile */}
      <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-[#2d6a4f] text-white shadow-sm"
                  : "text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-gray-700",
              )}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {tab === "dashboard-ia" && <SmartDashboardTab />}
      {tab === "chat-ia" && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border min-h-[600px]">
          <AIAssistant />
        </div>
      )}
      {tab === "alertas" && <AlertsCenterTab tenantId={tenantId} />}
    </div>
  );
}
