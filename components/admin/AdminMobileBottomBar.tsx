"use client";

/**
 * components/admin/AdminMobileBottomBar.tsx
 *
 * Barra de navegación rápida en el bottom (solo mobile / sm:hidden).
 * Muestra 4 tabs prioritarias por rol + un botón "Más" que abre el drawer.
 *
 * Las tabs prioritarias dependen del rol:
 *  - admin     → pedidos, fiados, inventario, productos
 *  - cajero    → pedidos, fiados, clientes, inventario
 *  - almacenero → asistente-ia, inventario, compras, plata
 *
 * Cada botón muestra el badge de alertas si lo tiene. El botón "Más"
 * agrega los alerts de las tabs no incluidas en la prioridad.
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { Menu } from "@buleje/design-system/icons";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { Tab } from "../../app/admin/_lib/tabs.types";

export interface FilteredTab {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface AdminMobileBottomBarProps {
  userRole: string;
  currentTab: Tab;
  filteredTabs: readonly FilteredTab[];
  alerts: Record<string, number>;
  onNavigate: (tab: Tab) => void;
  onOpenMobileNav: () => void;
}

const MOBILE_PRIORITY: Record<string, Tab[]> = {
  admin:      ["pedidos", "fiados", "inventario", "productos"],
  cajero:     ["pedidos", "fiados", "clientes", "inventario"],
  almacenero: ["inventario", "compras", "pedidos", "plata"],
};

export function AdminMobileBottomBar({
  userRole,
  currentTab,
  filteredTabs,
  alerts,
  onNavigate,
  onOpenMobileNav,
}: AdminMobileBottomBarProps) {
  const priorityIds = MOBILE_PRIORITY[userRole] ?? MOBILE_PRIORITY.admin;
  const quickTabs = priorityIds
    .map((id) => filteredTabs.find((t) => t.id === id))
    .filter((t): t is FilteredTab => t != null);

  const otherAlerts = Object.entries(alerts)
    .filter(([id]) => !priorityIds.includes(id as Tab))
    .reduce((sum, [, v]) => sum + v, 0);

  return (
    // Audit 2026-05-17 07-P2-2: touch targets ≥48px (WCAG 2.1 AA pide ≥44).
    // Antes py-1.5 + h-5 w-5 = ~32-36px → fácil mis-tap en mobile. Ahora
    // py-3 + min-h-[48px] cumple holgado.
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] flex items-stretch"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      aria-label="Navegación rápida"
    >
      {quickTabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-3 min-h-[48px] text-[length:var(--ts-2xs)] font-semibold transition-colors relative",
            currentTab === id ? "text-primary" : "text-[var(--text-tertiary)] dark:text-muted"
          )}
          aria-current={currentTab === id ? "page" : undefined}
        >
          {alerts[id] ? (
            <span className="relative inline-flex">
              <Icon className="h-5 w-5" />
              <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-extrabold flex items-center justify-center px-0.5">
                {alerts[id]}
              </span>
            </span>
          ) : (
            <Icon className="h-5 w-5" />
          )}
          <span className="leading-tight truncate max-w-14">{label}</span>
          {currentTab === id && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary" />}
        </button>
      ))}

      <button
        onClick={onOpenMobileNav}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-3 min-h-[48px] text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted transition-colors"
        aria-label="Más opciones"
      >
        <span className="relative inline-flex">
          <Menu className="h-5 w-5" />
          {otherAlerts > 0 && (
            <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-extrabold flex items-center justify-center px-0.5">
              {otherAlerts}
            </span>
          )}
        </span>
        <span className="leading-tight">Más</span>
      </button>
    </nav>
  );
}
