"use client";

/**
 * AdminSubSidebar — Secondary sidebar for module sub-sections.
 *
 * Appears between the main sidebar and content area when the active
 * module has multiple tabs (e.g., Clientes → Mis Clientes, Fiados, Prestamos, Scoring).
 * Includes breadcrumb, KPI badges, and mobile drawer.
 */

import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { ChevronLeft, X } from "@buleje/design-system/icons";
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
      <div className="flex items-center gap-2 px-3 py-3.5 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white/50 dark:bg-[var(--surface-raised)]/80">
        <button
          onClick={onBack}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          title="Volver al Dashboard"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
        <CategoryIcon className="h-4 w-4 text-primary shrink-0" />
        <CardTitle as="h2" className="text-[length:var(--ts-sm)] font-bold truncate flex-1">
          {categoryLabel}
        </CardTitle>
        {/* Mobile close */}
        {onMobileClose && (
          <button onClick={onMobileClose} className="sm:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-accent">
            <X className="h-4 w-4 text-[var(--text-tertiary)]" />
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
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all mb-0.5",
                isActive
                  ? "bg-primary/10 text-primary dark:bg-primary/20 font-semibold border-l-[3px] border-primary"
                  : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent border-l-[3px] border-transparent"
              )}
            >
              <TabIcon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
              <span className="truncate flex-1 text-left">{t.label}</span>
              {alertCount > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-xs font-extrabold tabular-nums leading-none ring-2",
                    isActive
                      ? "bg-primary/15 text-primary ring-primary/20"
                      : "bg-[var(--data-error-500)] text-white ring-[var(--surface-raised)] dark:ring-[var(--surface-canvas)] shadow-sm"
                  )}
                  title={`${alertCount} ${alertCount === 1 ? "alerta" : "alertas"} sin leer`}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
              {t.badge != null && t.badge > 0 && !alertCount && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-xs font-bold tabular-nums leading-none bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted ring-1 ring-[var(--rule-base)]">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Breadcrumb at bottom */}
      <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-3 py-2">
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted truncate">
          {categoryLabel} → {tabs.find(t => t.id === activeTab)?.label ?? ""}
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop — fixed secondary sidebar */}
      <aside
        className="hidden sm:flex fixed bottom-0 top-0 z-30 w-48 flex-col border-r border-[var(--rule-base)]/80 dark:border-[var(--rule-base)] bg-gray-50/90 dark:bg-[var(--surface-raised)]/60 backdrop-blur-sm transition-all duration-[var(--dur-base)]"
        style={{ left: mainSidebarWidth }}
      >
        {content}
      </aside>

      {/* Mobile — slide-over drawer */}
      {mobileOpen && (
        <>
          <div
            className="sm:hidden modal-backdrop"
            onClick={onMobileClose}
          />
          <aside className="sm:hidden fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col bg-[var(--surface-raised)] animate-in slide-in-from-left duration-[var(--dur-base)]">
            {content}
          </aside>
        </>
      )}
    </>
  );
}
