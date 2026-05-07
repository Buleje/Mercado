"use client";

import React from "react";
import { ChevronRight, LayoutDashboard } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  BASIC_SIDEBAR_MODULES,
  CONFIG_SIDEBAR_MODULE,
} from "./AdminSidebar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_MODULES = [
  ...BASIC_SIDEBAR_MODULES,
  CONFIG_SIDEBAR_MODULE,
];

/** Dado un moduleId, devuelve el label del modulo. Si no encuentra, devuelve el id. */
function getModuleLabel(moduleId: string): string {
  const found = ALL_MODULES.find((m) => m.id === moduleId);
  return found?.label ?? moduleId;
}

/** Dado un tabId, devuelve el label del tab. Si no encuentra, devuelve el id. */
function getTabLabel(tabId: string): string {
  for (const mod of ALL_MODULES) {
    const tab = mod.tabs.find((t) => t.id === tabId);
    if (tab) return tab.label;
  }
  return tabId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BreadcrumbsProps {
  moduleId: string;
  tabId: string;
  onNavigateModule: () => void;
  onNavigateHome: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Breadcrumbs({
  moduleId,
  tabId,
  onNavigateModule,
  onNavigateHome,
}: BreadcrumbsProps) {
  const moduleName = getModuleLabel(moduleId);
  const tabName = getTabLabel(tabId);

  // Mostrar tab solo si es diferente al nombre del modulo (case-insensitive)
  const showTab =
    tabName &&
    tabName.toLowerCase() !== moduleName.toLowerCase() &&
    tabId !== moduleId;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm min-w-0"
    >
      {/* Nivel 1: Admin / Home */}
      <button
        onClick={onNavigateHome}
        className={cn(
          "flex items-center gap-1 shrink-0",
          "text-[var(--text-tertiary)] hover:text-primary dark:hover:text-[var(--data-success-500)]",
          "transition-colors duration-[var(--dur-fast)] rounded px-1 py-0.5"
        )}
        aria-label="Volver al panel principal"
      >
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline text-xs">Admin</span>
      </button>

      {/* Separador 1 */}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />

      {/* Nivel 2: Modulo */}
      {showTab ? (
        <button
          onClick={onNavigateModule}
          className={cn(
            "text-[var(--text-tertiary)] hover:text-primary dark:hover:text-[var(--data-success-500)]",
            "transition-colors duration-[var(--dur-fast)] text-xs rounded px-1 py-0.5 truncate max-w-[120px] sm:max-w-none"
          )}
        >
          {moduleName}
        </button>
      ) : (
        <span
          className={cn(
            "text-[var(--text-primary)] font-semibold text-xs",
            "truncate max-w-[160px] sm:max-w-none px-1"
          )}
        >
          {moduleName}
        </span>
      )}

      {/* Nivel 3: Tab actual */}
      {showTab && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
          <span
            className={cn(
              "text-[var(--text-primary)] font-semibold text-xs",
              "truncate max-w-[120px] sm:max-w-[200px] px-1"
            )}
          >
            {tabName}
          </span>
        </>
      )}
    </nav>
  );
}
