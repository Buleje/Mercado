"use client";

import React from "react";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BreadcrumbsProps {
  moduleName: string;
  tabName: string;
  onNavigateModule: () => void;
  onNavigateHome: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Breadcrumbs({
  moduleName,
  tabName,
  onNavigateModule,
  onNavigateHome,
}: BreadcrumbsProps) {
  // Determinar si el tab es diferente al modulo (para mostrar el tercer nivel)
  const showTab = tabName && tabName !== moduleName;

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
          "text-gray-400 dark:text-gray-500 hover:text-[#2d6a4f] dark:hover:text-emerald-400",
          "transition-colors duration-150 rounded px-1 py-0.5"
        )}
        aria-label="Volver al panel principal"
      >
        {/* En desktop: icono + texto. En mobile: solo icono */}
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline text-xs">Admin</span>
      </button>

      {/* Separador 1 */}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />

      {/* Nivel 2: Modulo */}
      {showTab ? (
        <button
          onClick={onNavigateModule}
          className={cn(
            "text-gray-500 dark:text-gray-400 hover:text-[#2d6a4f] dark:hover:text-emerald-400",
            "transition-colors duration-150 text-xs rounded px-1 py-0.5 truncate max-w-[120px] sm:max-w-none"
          )}
        >
          {moduleName}
        </button>
      ) : (
        <span
          className={cn(
            "text-gray-800 dark:text-gray-200 font-semibold text-xs",
            "truncate max-w-[160px] sm:max-w-none px-1"
          )}
        >
          {moduleName}
        </span>
      )}

      {/* Nivel 3: Tab actual (solo si es diferente al modulo) */}
      {showTab && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
          <span
            className={cn(
              "text-gray-800 dark:text-gray-200 font-semibold text-xs",
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
