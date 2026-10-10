/**
 * Module-level role permissions.
 * Single source of truth for which admin roles can access which modules.
 *
 * Usage:
 *   import { MODULE_PERMISSIONS, canAccessModule, filterModulesByRole } from "@/lib/module-permissions";
 */

import type { AdminRole } from "@/lib/session";
import { VALID_TABS, type Tab } from "@/app/admin/_lib/tabs.types";
import { resolverDestino } from "@/lib/admin/destino-tab";

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
  | "plan"
  // ── Módulos de especialización (ADR-124) — solo visibles si el tenant
  // tiene la feature flag spec:<vertical>:<modulo> habilitada por superadmin
  | "ctp-libro-operaciones" // Forestal: Libro de Operaciones CTP (LOE-CTP SERFOR)
  | "gtf-emisor"            // Forestal: Emisor de Guías de Transporte Forestal (futuro)
  | "recetas-medicas"       // Salud: Recetas médicas (futuro)
  | "cuero-trazabilidad";   // Textil: Trazabilidad cuero (futuro)

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
    "rrhh",                  // Recursos Humanos (ADR-414) — nivel "marcar": asistencia del día
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

// ── Pestañas reales por rol (plan «panel unificado», carril O1-K2) ─────────

/**
 * Bandera del carril O1-K2 (decisión 15 del plan, 2026-10-09). Con `false` el
 * panel filtra por rol EXACTAMENTE como hasta hoy. Con `true`, el cajero y el
 * almacenero ven las pestañas reales de sus permisos: hoy ven 2 de 11 y 2 de 12
 * porque MODULE_PERMISSIONS usa nombres de pestaña viejos («pos-caja»,
 * «catalogo-tienda»…) que no coinciden con ninguna pestaña de hoy.
 * Se enciende sólo con el OK de Brandon y después de la pasada de `security`.
 */
export const ROL_CON_IDS_REALES = false;

/**
 * Roles cuya lista de pestañas sale de MODULE_PERMISSIONS. Los demás (manager,
 * owner, tienda_owner, analista, proveedor, delivery) ven hoy lo mismo que el
 * admin, salvo que el negocio les guarde una lista propia
 * (useAdminTabsDerived: `ROLE_TABS[rol] ?? ROLE_TABS.admin`); la bandera no los toca.
 */
const ROLES_CON_LISTA_PROPIA: ReadonlySet<string> = new Set(["cajero", "almacenero"]);

/**
 * La pestaña de HOY que tiene el contenido de cada permiso viejo, al CONCEDERLO.
 * Es el destino del link viejo (TAB_MIGRATION) salvo los 7 marcados «≠ link»:
 * ahí el link cae en una pestaña mucho más ancha que el permiso (Configuración,
 * Mi Plata, el Asistente IA, la lista de clientes) y concederla entera le daría
 * al rol más de lo que el permiso decía. Un link puede caer en una pestaña ancha
 * porque el filtro por rol igual aplica; un permiso, no.
 *
 * Vocabulario: ids de pestaña de hoy, el mismo de `origen` de las vistas (plan
 * R2). Cuando una pestaña se funda en otra, el permiso sigue al contenido por
 * `origen`; esta tabla no cambia. La revisa `security` antes de encender la bandera.
 */
const PESTANAS_DEL_PERMISO = {
  // ≠ link (asistente-ia): «los KPIs del día, sólo ver» viven en Inicio; el
  // Asistente IA consulta y anota sobre todo el negocio.
  "panel-principal": ["vendor-dashboard"],
  // ≠ link (Mi Plata): los reportes del día viven en Inicio (vistas Ventas,
  // Productos, Compras); Mi Plata es la plata entera del negocio.
  "reportes-documentos": ["vendor-dashboard"],
  // ≠ link (Configuración): mandar mensajes a los clientes vive en Mensajes.
  comunicaciones: ["whatsapp-inbox"],
  // ≠ link (Configuración): notas y pendientes del turno viven en Equipo › Tareas.
  "agenda-utilidades": ["tareas"],
  // ≠ link (Configuración): las tareas son pestaña propia desde que se montó
  // TasksTab en Equipo (el link viejo quedó apuntando a Configuración).
  "proyectos-tareas": ["tareas"],
  // ≠ link (Clientes): rutas, envíos y devoluciones salen del pedido (el plan
  // F11 junta el reparto en Pedidos). La lista de Clientes es sólo del admin
  // (GET /api/customers → 403 al cajero y al almacenero, medido 09-10).
  logistica: ["pedidos"],
  "devoluciones-calidad": ["pedidos"],
  "pos-caja": ["ventas-caja"],
  "inventario-almacenes": ["inventario"],
  reposicion: ["inventario"],
  "catalogo-tienda": ["productos"],
  "precios-promos": ["productos"],
  proveedores: ["compras"],
  "ventas-marketing": ["analytics-pro"],
  "crm-clientes": ["clientes"],
  fidelizacion: ["clientes"],
  "encuestas-soporte": ["clientes"],
  resenas: ["clientes"],
  "analytics-bi": ["plata"],
  proyecciones: ["plata"],
  finanzas: ["plata"],
  tesoreria: ["plata"],
  "gastos-activos": ["plata"],
  "alertas-automatizacion": ["config"],
  configuracion: ["config"],
  equipo: ["config"],
} as const satisfies Partial<Record<ModuleId, readonly Tab[]>>;

/** Los permisos de la tabla que NO siguen al link viejo (los «≠ link» de arriba). */
export const PERMISOS_DISTINTOS_DEL_LINK: readonly ModuleId[] = [
  "panel-principal",
  "reportes-documentos",
  "comunicaciones",
  "agenda-utilidades",
  "proyectos-tareas",
  "logistica",
  "devoluciones-calidad",
];

const PESTANAS_DE_HOY: ReadonlySet<string> = new Set<string>(VALID_TABS);

/**
 * Las pestañas reales que concede un permiso: la tabla para los nombres viejos,
 * el mismo id si ya es una pestaña, y si no, adonde lleva su link viejo
 * (resolverDestino). `[]` = ninguna.
 */
export function pestanasDelPermiso(id: string): readonly Tab[] {
  if (Object.hasOwn(PESTANAS_DEL_PERMISO, id)) {
    return PESTANAS_DEL_PERMISO[id as keyof typeof PESTANAS_DEL_PERMISO];
  }
  if (PESTANAS_DE_HOY.has(id)) return [id as Tab];
  const destino = resolverDestino(id);
  return destino ? [destino.tab] : [];
}

function aPestanasReales(ids: readonly string[]): Tab[] {
  const salida = new Set<Tab>();
  for (const id of ids) for (const tab of pestanasDelPermiso(id)) salida.add(tab);
  return [...salida];
}

/**
 * Las pestañas que ve un rol (antes de plan, plantilla, rubro y ocultos).
 * `null` = sin filtro: admin, superadmin y los roles sin lista propia ni guardada.
 *
 * Bandera apagada: la lista tal cual, como hoy (ids viejos incluidos; el panel
 * descarta los que no son pestaña). Encendida: cada id traducido a su pestaña
 * real con `pestanasDelPermiso`. `opciones.idsReales` existe para los tests y
 * la tabla rol → pestañas del carril; el panel no lo pasa.
 */
export function tabsDelRol(
  role: string,
  overrides?: Record<string, string[]> | null,
  opciones: { idsReales?: boolean } = {},
): readonly string[] | null {
  if (role === "admin" || role === "superadmin") return null;
  const guardada = overrides && Object.hasOwn(overrides, role) ? overrides[role] : undefined;
  const lista = Array.isArray(guardada)
    ? guardada
    : ROLES_CON_LISTA_PROPIA.has(role)
      ? MODULE_PERMISSIONS[role as "cajero" | "almacenero"]
      : null;
  if (!lista) return null;
  return (opciones.idsReales ?? ROL_CON_IDS_REALES) ? aPestanasReales(lista) : lista;
}
