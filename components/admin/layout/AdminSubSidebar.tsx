"use client";

/**
 * AdminSubSidebar — Secondary sidebar for module sub-sections.
 *
 * Appears between the main sidebar and content area when the active
 * module has multiple tabs (e.g., Clientes → Mis Clientes, Fiados, Prestamos, Scoring).
 * Includes breadcrumb, KPI badges, and mobile drawer.
 */

import { cn } from "@/lib/utils";
import { ChevronLeft, X } from "lucide-react";
import type { ComponentType } from "react";

interface SubSidebarTab {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
}

interface AdminSubSidebarProps {
  categoryLabel: string;
  categoryIcon: ComponentType<{ className?: string }>;
  tabs: SubSidebarTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onBack: () => void;
  mainSidebarWidth: number;
  alerts?: Record<string, number>;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSubSidebar({
  categoryLabel,
  categoryIcon: CategoryIcon,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  mainSidebarWidth,
  alerts = {},
  mobileOpen = false,
  onMobileClose,
}: AdminSubSidebarProps) {
  if (tabs.length <= 1) return null;

  const content = (
    <>
      {/* Category header with back button */}
      <div className="flex items-center gap-2 px-3 py-3.5 border-b border-gray-200 dark:border-card-border bg-white/50 dark:bg-card/80">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          title="Volver al Dashboard"
        >
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        </button>
        <CategoryIcon className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-[13px] font-bold text-gray-700 dark:text-foreground truncate flex-1">
          {categoryLabel}
        </h2>
        {/* Mobile close */}
        {onMobileClose && (
          <button onClick={onMobileClose} className="sm:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-accent">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Sub-section tabs */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {tabs.map((t) => {
          const TabIcon = t.icon;
          const isActive = activeTab === t.id;
          const alertCount = alerts[t.id] || 0;
          return (
            <button
              key={t.id}
              onClick={() => {
                onTabChange(t.id);
                onMobileClose?.();
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5",
                isActive
                  ? "bg-primary/10 text-primary dark:bg-primary/20 font-semibold border-l-[3px] border-primary"
                  : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent border-l-[3px] border-transparent"
              )}
            >
              <TabIcon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
              <span className="truncate flex-1 text-left">{t.label}</span>
              {alertCount > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center",
                  isActive ? "bg-primary/20 text-primary" : "bg-red-500 text-white"
                )}>
                  {alertCount}
                </span>
              )}
              {t.badge != null && t.badge > 0 && !alertCount && (
                <span className="text-[10px] text-gray-400 dark:text-muted font-medium">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Breadcrumb at bottom */}
      <div className="border-t border-gray-100 dark:border-card-border px-3 py-2">
        <p className="text-[10px] text-gray-400 dark:text-muted truncate">
          {categoryLabel} → {tabs.find(t => t.id === activeTab)?.label ?? ""}
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop — fixed secondary sidebar */}
      <aside
        className="hidden sm:flex fixed bottom-0 top-0 z-30 w-48 flex-col border-r border-gray-200/80 dark:border-card-border bg-gray-50/90 dark:bg-card/60 backdrop-blur-sm transition-all duration-300"
        style={{ left: mainSidebarWidth }}
      >
        {content}
      </aside>

      {/* Mobile — slide-over drawer */}
      {mobileOpen && (
        <>
          <div
            className="sm:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="sm:hidden fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col bg-white dark:bg-card animate-in slide-in-from-left duration-200">
            {content}
          </aside>
        </>
      )}
    </>
  );
}
