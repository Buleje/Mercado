"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Brain, MessageSquare, Bell, GripVertical } from "lucide-react";
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

  // ── Drag-and-drop tab reordering ──
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...TABS.map((t) => t.id)];
    try {
      const s = localStorage.getItem("asistente-tab-order");
      if (s) {
        const parsed = JSON.parse(s);
        const allIds: string[] = [...TABS.map((t) => t.id)];
        const valid = (parsed as string[]).filter((id: string) => allIds.includes(id));
        const missing = allIds.filter((id: string) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {
      /* ignore */
    }
    return [...TABS.map((t) => t.id)];
  });
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  const orderedTabs = useMemo(
    () =>
      tabOrder
        .map((id) => TABS.find((t) => t.id === id))
        .filter(Boolean) as unknown as typeof TABS,
    [tabOrder],
  );

  function handleDropTab(targetId: string) {
    if (!draggedTab || draggedTab === targetId) return;
    const n = [...tabOrder];
    const f = n.indexOf(draggedTab);
    const t = n.indexOf(targetId);
    n.splice(f, 1);
    n.splice(t, 0, draggedTab);
    setTabOrder(n);
    localStorage.setItem("asistente-tab-order", JSON.stringify(n));
    setDraggedTab(null);
    setDragOverTab(null);
  }

  const resetTabOrder = () => {
    setTabOrder([...TABS.map((t) => t.id)]);
    localStorage.removeItem("asistente-tab-order");
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header uniforme */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Asistente IA
          </h1>
          <p className="text-xs text-gray-500">
            Chat con IA, resumen del día y alertas
          </p>
        </div>
      </div>

      {bannerVisible && (
        <button
          onClick={toggleBanner}
          className="w-full text-left bg-[#0f766e]/5 dark:bg-[#0f766e]/10 border border-[#0f766e]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#0f766e]/10"
        >
          <p className="text-sm text-[#0f766e] dark:text-emerald-400">
            <span className="font-semibold">Asistente</span> — Aquí ves el
            resumen de tu negocio del día, puedes chatear con la IA y revisar
            alertas importantes.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button
          onClick={toggleBanner}
          className="text-xs text-gray-400 hover:text-[#0f766e] transition-colors"
        >
          Mostrar descripción
        </button>
      )}

      {/* Tab bar — pill style with drag-drop, scrollable on mobile */}
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-gray-100 dark:from-[var(--color-surface)] to-transparent z-10 pointer-events-none rounded-l-xl" />
        <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto scrollbar-none">
          {orderedTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                draggable
                onDragStart={() => setDraggedTab(t.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTab(t.id);
                }}
                onDragLeave={() => setDragOverTab(null)}
                onDrop={() => handleDropTab(t.id)}
                onDragEnd={() => {
                  setDraggedTab(null);
                  setDragOverTab(null);
                }}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing",
                  tab === t.id
                    ? "bg-[#0f766e] text-white shadow-sm"
                    : "text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-gray-700",
                  draggedTab === t.id && "opacity-40 scale-95",
                  dragOverTab === t.id &&
                    draggedTab !== t.id &&
                    "ring-2 ring-[#0f766e] ring-offset-1",
                )}
                aria-current={tab === t.id ? "page" : undefined}
              >
                <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
          {/* Reset tab order button */}
          {JSON.stringify(tabOrder) !==
            JSON.stringify(TABS.map((t) => t.id)) && (
            <button
              onClick={resetTabOrder}
              className="shrink-0 ml-1 px-2 py-1.5 text-[10px] text-gray-400 dark:text-muted hover:text-[#0f766e] dark:hover:text-emerald-400 transition-colors whitespace-nowrap"
              title="Restablecer orden de tabs"
            >
              Restablecer
            </button>
          )}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-100 dark:from-[var(--color-surface)] to-transparent z-10 pointer-events-none rounded-r-xl" />
      </div>

      {/* Active tab content */}
      {tab === "dashboard-ia" && <SmartDashboardTab />}
      {tab === "chat-ia" && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border min-h-[600px] h-[calc(100vh-220px)]">
          <AIAssistant embedded />
        </div>
      )}
      {tab === "alertas" && <AlertsCenterTab tenantId={tenantId} />}
    </div>
  );
}
