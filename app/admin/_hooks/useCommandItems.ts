"use client";

/**
 * app/admin/_hooks/useCommandItems.ts
 *
 * Hook que construye la lista de items para el Command Palette (Cmd+K)
 * del admin. Incluye:
 *  - Modulos navegables (con icono Lucide, descripcion, shortcut)
 *  - Documentos comerciales (cotizaciones, guias, notas credito, contratos)
 *  - Sistema (config, plan)
 *  - Acciones rapidas (nueva venta, nuevo producto, etc.)
 *
 * Recibe `navigateTab` para enlazar cada item a su accion.
 *
 * Extraido de app/admin/page.tsx (Paso 4 del refactor).
 * Enriquecido con MODULE_INFO (icono Lucide, desc, shortcut).
 */

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { Tab } from "../_lib/tabs.types";
import { MODULE_INFO } from "../_lib/tab-categories";

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon?: string;
  /** Lucide icon component from MODULE_INFO */
  iconComponent?: ComponentType<{ className?: string }>;
  /** Tailwind color class for the icon */
  iconColor?: string;
  subtitle?: string;
  /** Keyboard shortcut label (e.g. "Alt+1") */
  shortcut?: string;
  onSelect: () => void;
}

// Keyboard shortcuts for modules (Alt+number)
const TAB_SHORTCUTS: Partial<Record<Tab, string>> = {
  "asistente-ia": "Alt+1",
  pedidos: "Alt+2",
  inventario: "Alt+3",
  productos: "Alt+4",
  compras: "Alt+5",
  plata: "Alt+6",
  clientes: "Alt+7",
  fiados: "Alt+8",
  config: "Alt+9",
  plan: "Alt+0",
};

// Category grouping for the command palette
type PaletteCategory = "Negocio" | "Inventario" | "Dinero" | "Documento" | "Sistema" | "Accion";

interface ModuleEntry {
  id: Tab;
  label: string;
  icon: string;
  category: PaletteCategory;
}

// Truncate description to maxLen chars
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trimEnd() + "...";
}

const MODULES: ModuleEntry[] = [
  // ── Negocio ──
  { id: "vendor-dashboard", label: "Inicio",                 icon: "",  category: "Negocio" },
  { id: "asistente-ia",     label: "Asistente IA",           icon: "",  category: "Negocio" },
  { id: "ventas-caja",      label: "Ventas & Caja",          icon: "",  category: "Negocio" },
  { id: "pedidos",          label: "Pedidos",                icon: "",  category: "Negocio" },
  { id: "promociones",      label: "Promociones & Ofertas",  icon: "",  category: "Negocio" },
  { id: "marketplace",      label: "Marketplace",            icon: "",  category: "Negocio" },
  { id: "pagina-inicio",    label: "Mi tienda pública",      icon: "",  category: "Negocio" },
  { id: "store-customizer", label: "Identidad y tema",       icon: "",  category: "Negocio" },
  { id: "analytics-pro",    label: "Analytics Pro",          icon: "",  category: "Negocio" },
  { id: "fiados",           label: "Fiados",                 icon: "",  category: "Negocio" },
  { id: "turnos",           label: "Turnos de Caja",         icon: "",  category: "Negocio" },
  { id: "prestamos",        label: "Prestamos",              icon: "",  category: "Negocio" },
  // ── Inventario ──
  { id: "inventario",       label: "Inventario & Almacenes", icon: "",  category: "Inventario" },
  { id: "productos",        label: "Productos & Precios",    icon: "",  category: "Inventario" },
  { id: "compras",          label: "Compras & Proveedores",  icon: "",  category: "Inventario" },
  // ── Dinero ──
  { id: "plata",            label: "Mi Plata (Finanzas)",    icon: "",  category: "Dinero" },
  { id: "clientes",         label: "Mis Clientes (CRM)",     icon: "",  category: "Dinero" },
  { id: "adelantos",        label: "Adelantos",              icon: "",  category: "Dinero" },
  // ── Documento ──
  { id: "cotizaciones",     label: "Cotizaciones",           icon: "",  category: "Documento" },
  { id: "guias-remision",   label: "Guias de Remision",      icon: "",  category: "Documento" },
  { id: "notas-credito",    label: "Notas de Credito",       icon: "",  category: "Documento" },
  { id: "contratos",        label: "Contratos",              icon: "",  category: "Documento" },
  // ── Sistema ──
  { id: "config",           label: "Configuracion",          icon: "",  category: "Sistema" },
  { id: "plan",             label: "Plan & Suscripcion",     icon: "",  category: "Sistema" },
  { id: "rendimiento",      label: "Rendimiento",            icon: "",  category: "Sistema" },
  { id: "auditoria",        label: "Auditoria",              icon: "",  category: "Sistema" },
];

/**
 * @param visibleTabIds Set de los módulos que el negocio TIENE ACTUALMENTE
 *   visibles (del sidebar). Si se pasa, el palette solo busca/ofrece esos
 *   módulos (Brandon 2026-05-29: "que solo se busque de acuerdo a los módulos
 *   actuales"). Si es undefined, muestra todo el catálogo (compat).
 */
export function useCommandItems(
  navigateTab: (id: Tab) => void,
  visibleTabIds?: ReadonlySet<string>,
): CommandItem[] {
  return useMemo<CommandItem[]>(() => {
    const has = (id: Tab) => !visibleTabIds || visibleTabIds.has(id);

    const items: CommandItem[] = MODULES.filter((m) => has(m.id)).map((m) => {
      const info = MODULE_INFO[m.id];
      return {
        ...m,
        iconComponent: info?.icon,
        iconColor: info?.iconColor,
        subtitle: info ? truncate(info.desc, 60) : undefined,
        shortcut: TAB_SHORTCUTS[m.id],
        onSelect: () => navigateTab(m.id),
      };
    });

    // Quick actions — solo si su módulo destino está visible.
    const actions: Array<{ id: string; label: string; target: Tab }> = [
      { id: "action-new-sale",     label: "Nueva venta",    target: "pedidos" },
      { id: "action-new-product",  label: "Nuevo producto", target: "productos" },
      { id: "action-new-customer", label: "Nuevo cliente",  target: "clientes" },
      { id: "action-inventario",   label: "Ver stock",      target: "inventario" },
    ];
    for (const a of actions) {
      if (has(a.target)) {
        items.push({ id: a.id, label: a.label, category: "Accion", onSelect: () => navigateTab(a.target) });
      }
    }

    return items;
  }, [navigateTab, visibleTabIds]);
}
