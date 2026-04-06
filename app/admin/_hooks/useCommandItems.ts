"use client";

/**
 * app/admin/_hooks/useCommandItems.ts
 *
 * Hook que construye la lista de items para el Command Palette (Cmd+K)
 * del admin. Incluye:
 *  - Módulos navegables (con icono emoji y categoría)
 *  - Documentos comerciales (cotizaciones, guías, notas crédito, contratos)
 *  - Sistema (config, plan)
 *  - Acciones rápidas (nueva venta, nuevo producto, etc.)
 *
 * Recibe `navigateTab` para enlazar cada item a su acción.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useMemo } from "react";
import type { Tab } from "../_lib/tabs.types";

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon?: string;
  onSelect: () => void;
}

interface ModuleEntry {
  id: Tab;
  label: string;
  icon: string;
  category: string;
}

const MODULES: ModuleEntry[] = [
  { id: "asistente-ia",   label: "Asistente IA",            icon: "🧠", category: "Módulo" },
  { id: "ventas-caja",    label: "Ventas & Caja (POS)",     icon: "🖥️", category: "Módulo" },
  { id: "inventario",     label: "Inventario & Almacenes",  icon: "📦", category: "Módulo" },
  { id: "productos",      label: "Productos & Precios",     icon: "🏪", category: "Módulo" },
  { id: "compras",        label: "Compras & Proveedores",   icon: "📋", category: "Módulo" },
  { id: "plata",          label: "Mi Plata (Finanzas)",     icon: "💵", category: "Módulo" },
  { id: "clientes",       label: "Mis Clientes (CRM)",      icon: "👥", category: "Módulo" },
  { id: "analytics-pro",  label: "Analytics Pro",           icon: "📊", category: "Módulo" },
  { id: "fiados",         label: "Fiados",                  icon: "💰", category: "Módulo" },
  { id: "turnos",         label: "Turnos de Caja",          icon: "⏱️", category: "Módulo" },
  { id: "recetas",        label: "Recetas & Producción",    icon: "🍳", category: "Módulo" },
  { id: "prestamos",      label: "Préstamos",               icon: "🏦", category: "Módulo" },
  { id: "pedidos",        label: "Pedidos",                 icon: "🛒", category: "Módulo" },
  { id: "cotizaciones",   label: "Cotizaciones",            icon: "📄", category: "Documento" },
  { id: "guias-remision", label: "Guías de Remisión",       icon: "🚚", category: "Documento" },
  { id: "notas-credito",  label: "Notas de Crédito",        icon: "📝", category: "Documento" },
  { id: "contratos",      label: "Contratos",               icon: "📑", category: "Documento" },
  { id: "config",         label: "Configuración",           icon: "⚙️", category: "Sistema" },
  { id: "plan",           label: "Plan & Suscripción",      icon: "⚡", category: "Sistema" },
];

export function useCommandItems(navigateTab: (id: Tab) => void): CommandItem[] {
  return useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = MODULES.map((m) => ({
      ...m,
      onSelect: () => navigateTab(m.id),
    }));

    // Quick actions
    items.push(
      { id: "action-new-sale",     label: "Nueva venta (POS)",  icon: "➕", category: "Acción", onSelect: () => navigateTab("ventas-caja") },
      { id: "action-new-product",  label: "Nuevo producto",     icon: "➕", category: "Acción", onSelect: () => navigateTab("productos") },
      { id: "action-new-customer", label: "Nuevo cliente",      icon: "➕", category: "Acción", onSelect: () => navigateTab("clientes") },
      { id: "action-inventario",   label: "Ver stock",          icon: "🔍", category: "Acción", onSelect: () => navigateTab("inventario") },
    );

    return items;
  }, [navigateTab]);
}
