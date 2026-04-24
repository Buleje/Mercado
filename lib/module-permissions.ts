/**
 * Module-level role permissions.
 * Single source of truth for which admin roles can access which modules.
 *
 * Usage:
 *   import { MODULE_PERMISSIONS, canAccessModule, filterModulesByRole } from "@/lib/module-permissions";
 */

import type { AdminRole } from "@/lib/session";

// All module IDs — must stay in sync with the Tab type in app/admin/page.tsx
export type ModuleId =
  | "vendor-dashboard"
  | "panel-principal"
  | "pos-caja"
  | "inventario-almacenes"
  | "reposicion"
  | "catalogo-tienda"
  | "precios-promos"
  | "compras"
  | "proveedores"
  | "logistica"
  | "devoluciones-calidad"
  | "ventas-marketing"
  | "crm-clientes"
  | "fidelizacion"
  | "encuestas-soporte"
  | "analytics-bi"
  | "proyecciones"
  | "finanzas"
  | "tesoreria"
  | "facturacion"
  | "gastos-activos"
  | "rrhh"
  | "proyectos-tareas"
  | "comunicaciones"
  | "alertas-automatizacion"
  | "reportes-documentos"
  | "agenda-utilidades"
  | "seguridad"
  | "sistema"
  | "clientes"
  | "resenas"
  | "pedidos"
  | "configuracion"
  | "equipo"
  | "plan";

/**
 * Default module access per role.
 *
 * - superadmin → todos los módulos (se maneja igual que admin: canAccessModule() retorna true)
 * - admin      → all modules (enforced in UI, not listed here — use canAccessModule() which always returns true for admin)
 * - cajero     → front-of-house operations: POS, orders, customers, catalog, promotions, loyalty, returns
 * - almacenero → back-of-house: inventory, purchasing, suppliers, logistics, returns
 */
export const MODULE_PERMISSIONS: Record<Exclude<AdminRole, "admin" | "superadmin">, ModuleId[]> = {
  // Roles básicos del sistema (acceso mínimo operativo)
  proveedor: [
    "vendor-dashboard",
    "panel-principal",
    "compras",
    "proveedores",
  ],
  delivery: [
    "panel-principal",
    "pedidos",
    "logistica",
  ],
  tienda_owner: [
    "vendor-dashboard",
    "panel-principal",
    "pos-caja",
    "inventario-almacenes",
    "reposicion",
    "catalogo-tienda",
    "precios-promos",
    "compras",
    "proveedores",
    "logistica",
    "devoluciones-calidad",
    "ventas-marketing",
    "crm-clientes",
    "fidelizacion",
    "encuestas-soporte",
    "analytics-bi",
    "proyecciones",
    "finanzas",
    "tesoreria",
    "facturacion",
    "gastos-activos",
    "comunicaciones",
    "alertas-automatizacion",
    "reportes-documentos",
    "agenda-utilidades",
    "clientes",
    "resenas",
    "pedidos",
    "configuracion",
    "plan",
  ],
  cajero: [
    "panel-principal",       // Executive KPIs (read-only view)
    "pos-caja",              // Point of Sale — primary workstation
    "pedidos",               // Incoming orders to process
    "clientes",              // Customer lookup & loyalty tier
    "catalogo-tienda",       // Browse product catalog & availability
    "precios-promos",        // View active prices, promotions & coupons
    "fidelizacion",          // Apply / view loyalty points at checkout
    "devoluciones-calidad",  // Process counter returns and refunds
    "comunicaciones",        // Send messages / WhatsApp to customers
    "agenda-utilidades",     // Daily notes & shift calendar
    "reportes-documentos",   // Daily sales reports & receipts
  ],
  almacenero: [
    "panel-principal",       // Executive KPIs (read-only view)
    "inventario-almacenes",  // Stock management, kardex, locations
    "reposicion",            // Auto-reorder & demand prediction
    "compras",               // Purchase orders, RFQ, receipts
    "proveedores",           // Supplier directory & evaluations
    "logistica",             // Delivery routes & shipment tracking
    "devoluciones-calidad",  // Receive returned goods & QC
    "catalogo-tienda",       // View product catalog
    "agenda-utilidades",     // Inventory notes & calendar
    "reportes-documentos",   // Inventory & procurement reports
  ],

  // TODO: revisar permisos finos para estos roles cuando se active el plan multi-rol
  owner: [
    // Acceso completo operativo — igual que admin salvo gestión de equipo y sistema
    "panel-principal",
    "pos-caja",
    "inventario-almacenes",
    "reposicion",
    "catalogo-tienda",
    "precios-promos",
    "compras",
    "proveedores",
    "logistica",
    "devoluciones-calidad",
    "ventas-marketing",
    "crm-clientes",
    "fidelizacion",
    "encuestas-soporte",
    "analytics-bi",
    "proyecciones",
    "finanzas",
    "tesoreria",
    "facturacion",
    "gastos-activos",
    "rrhh",
    "proyectos-tareas",
    "comunicaciones",
    "alertas-automatizacion",
    "reportes-documentos",
    "agenda-utilidades",
    "clientes",
    "resenas",
    "pedidos",
    "configuracion",
    "equipo",
    "plan",
  ],

  manager: [
    // Gestión operativa sin acceso a finanzas críticas ni configuración de sistema
    "panel-principal",
    "pos-caja",
    "inventario-almacenes",
    "reposicion",
    "catalogo-tienda",
    "precios-promos",
    "compras",
    "proveedores",
    "logistica",
    "devoluciones-calidad",
    "ventas-marketing",
    "crm-clientes",
    "fidelizacion",
    "encuestas-soporte",
    "analytics-bi",
    "proyecciones",
    "gastos-activos",
    "rrhh",
    "proyectos-tareas",
    "comunicaciones",
    "alertas-automatizacion",
    "reportes-documentos",
    "agenda-utilidades",
    "clientes",
    "resenas",
    "pedidos",
    "equipo",
  ],

  analista: [
    // Solo módulos de lectura y reporting — sin operaciones de caja ni escrituras
    "panel-principal",
    "analytics-bi",
    "proyecciones",
    "ventas-marketing",
    "crm-clientes",
    "reportes-documentos",
    "agenda-utilidades",
    "clientes",
    "resenas",
    "pedidos",
  ],
};

/**
 * Returns true if `role` can access `moduleId`.
 * Admin always returns true regardless of the moduleId.
 *
 * @param role       The user's role string from the session
 * @param moduleId   The module ID to check (e.g. "pos-caja")
 * @param overrides  Optional custom per-role overrides saved in Settings
 */
export function canAccessModule(
  role: string,
  moduleId: string,
  overrides?: Record<string, string[]>,
): boolean {
  if (role === "admin" || role === "superadmin") return true;
  const allowed = overrides?.[role] ?? MODULE_PERMISSIONS[role as Exclude<AdminRole, "admin" | "superadmin">] ?? [];
  return allowed.includes(moduleId as ModuleId);
}

/**
 * Returns the allowed module list for a given role, respecting overrides.
 * Admin receives the full `allModules` list unchanged.
 *
 * @param role        The user's role string
 * @param allModules  The complete list of module IDs to filter from
 * @param overrides   Optional custom per-role overrides saved in Settings
 */
export function filterModulesByRole<T extends string>(
  role: string,
  allModules: T[],
  overrides?: Record<string, string[]>,
): T[] {
  if (role === "admin" || role === "superadmin") return allModules;
  const allowed = overrides?.[role] ?? MODULE_PERMISSIONS[role as Exclude<AdminRole, "admin" | "superadmin">] ?? [];
  return allModules.filter((m) => allowed.includes(m));
}
