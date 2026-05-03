/**
 * Matriz RBAC documental — vista para el panel de Permisos del Security Center.
 *
 * Esta NO es la fuente de verdad de la autorización: la fuente real es
 * `lib/auth/role-permissions.ts` (consumido por middleware y route handlers).
 * Este archivo es solo una vista resumida para mostrar al superadmin qué
 * puede hacer cada rol, sin exponer la lógica completa de permisos.
 *
 * Mantener en sync con `role-permissions.ts` cuando se agreguen recursos.
 */

export type RbacAccess = "full" | "read" | "write" | "none";

export interface RbacRoleDef {
  role: string;
  label: string;
  description: string;
}

export const RBAC_ROLES: RbacRoleDef[] = [
  { role: "superadmin", label: "SuperAdmin", description: "Acceso total a la plataforma" },
  { role: "admin", label: "Admin", description: "Dueño de tenant, acceso completo en su tenant" },
  { role: "cajero", label: "Cajero", description: "POS, ventas, consultas limitadas" },
  { role: "almacenero", label: "Almacenero", description: "Inventario, compras, proveedores" },
  { role: "vendor", label: "Vendor", description: "Gestiona su catálogo en marketplace" },
  { role: "viewer", label: "Viewer", description: "Solo lectura de reportes" },
];

export interface RbacResourceDef {
  resource: string;
  label: string;
  group: string;
  access: Record<string, RbacAccess>;
}

export const RBAC_MATRIX: RbacResourceDef[] = [
  { resource: "orders", label: "Pedidos", group: "Operaciones",
    access: { superadmin: "full", admin: "full", cajero: "write", almacenero: "read", vendor: "read", viewer: "read" } },
  { resource: "products", label: "Productos", group: "Catálogo",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "write", vendor: "none", viewer: "read" } },
  { resource: "customers", label: "Clientes", group: "Operaciones",
    access: { superadmin: "full", admin: "full", cajero: "write", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "reviews", label: "Reseñas", group: "Operaciones",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "read", viewer: "read" } },
  { resource: "settings", label: "Configuración", group: "Sistema",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "read", vendor: "none", viewer: "none" } },
  { resource: "promotions", label: "Promociones", group: "Marketing",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "read", viewer: "read" } },
  { resource: "coupons", label: "Cupones", group: "Marketing",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "read", viewer: "read" } },
  { resource: "activity-log", label: "Log de actividad", group: "Auditoría",
    access: { superadmin: "full", admin: "read", cajero: "read", almacenero: "read", vendor: "none", viewer: "read" } },
  { resource: "admin-users", label: "Usuarios admin", group: "Sistema",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "none", vendor: "none", viewer: "none" } },
  { resource: "cash-registers", label: "Cajas", group: "Finanzas",
    access: { superadmin: "full", admin: "full", cajero: "full", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "sales", label: "Ventas", group: "Finanzas",
    access: { superadmin: "full", admin: "full", cajero: "full", almacenero: "none", vendor: "read", viewer: "read" } },
  { resource: "inventory", label: "Inventario", group: "Almacén",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "full", vendor: "none", viewer: "read" } },
  { resource: "suppliers", label: "Proveedores", group: "Almacén",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "full", vendor: "none", viewer: "read" } },
  { resource: "purchases", label: "Compras", group: "Almacén",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "full", vendor: "none", viewer: "read" } },
  { resource: "payables", label: "Cuentas por pagar", group: "Finanzas",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "read", vendor: "none", viewer: "read" } },
  { resource: "expenses", label: "Gastos", group: "Finanzas",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "backup", label: "Respaldos", group: "Sistema",
    access: { superadmin: "full", admin: "read", cajero: "none", almacenero: "none", vendor: "none", viewer: "none" } },
  { resource: "analytics", label: "Analítica", group: "Reportes",
    access: { superadmin: "full", admin: "read", cajero: "none", almacenero: "none", vendor: "read", viewer: "read" } },
  { resource: "chat", label: "Chat interno", group: "Operaciones",
    access: { superadmin: "full", admin: "full", cajero: "write", almacenero: "write", vendor: "none", viewer: "none" } },
  { resource: "delivery-slots", label: "Slots de entrega", group: "Operaciones",
    access: { superadmin: "full", admin: "full", cajero: "write", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "demand-prediction", label: "Predicción de demanda", group: "Reportes",
    access: { superadmin: "full", admin: "full", cajero: "none", almacenero: "none", vendor: "none", viewer: "none" } },
  { resource: "bundles", label: "Bundles", group: "Catálogo",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "notifications", label: "Notificaciones", group: "Marketing",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "write", viewer: "none" } },
  { resource: "loyalty", label: "Fidelidad", group: "Marketing",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "none", vendor: "none", viewer: "read" } },
  { resource: "store_orders", label: "Pedidos marketplace", group: "Marketplace",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "read", vendor: "full", viewer: "read" } },
  { resource: "wholesale_orders", label: "Pedidos mayoristas", group: "Marketplace",
    access: { superadmin: "full", admin: "full", cajero: "read", almacenero: "read", vendor: "full", viewer: "read" } },
];
