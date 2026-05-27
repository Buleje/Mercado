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

// Brandon 2026-05-27: bottom bar fija con 5 accesos directos para todos los
// roles — Inicio, Pedidos, POS (Ventas & Caja), Adelantos, Compras.
const FIVE_QUICK: Tab[] = ["vendor-dashboard", "pedidos", "ventas-caja", "adelantos", "compras"];
const MOBILE_PRIORITY: Record<string, Tab[]> = {
  admin:      FIVE_QUICK,
  cajero:     FIVE_QUICK,
  almacenero: FIVE_QUICK,
};
// Labels cortos para que entren los 5 en la barra móvil.
const SHORT_LABELS: Record<string, string> = {
  "vendor-dashboard": "Inicio",
  pedidos: "Pedidos",
  "ventas-caja": "POS",
  adelantos: "Adelantos",
  compras: "Compras",
};

export function AdminMobileBottomBar({
  userRole,
  currentTab,
  filteredTabs,
  alerts,
  onNavigate,
}: AdminMobileBottomBarProps) {
  const priorityIds = MOBILE_PRIORITY[userRole] ?? MOBILE_PRIORITY.admin;
  const quickTabs = priorityIds
    .map((id) => filteredTabs.find((t) => t.id === id))
    .filter((t): t is FilteredTab => t != null);

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
          <span className="leading-tight truncate max-w-16">{SHORT_LABELS[id] ?? label}</span>
          {currentTab === id && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary" />}
        </button>
      ))}
    </nav>
  );
}
