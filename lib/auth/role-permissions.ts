/**
 * Role-Based Access Control (RBAC) Matrix
 *
 * Define qué roles pueden realizar qué acciones sobre qué recursos.
 * Usado por lib/require-admin.ts para validación granular de permisos.
 *
 * `Role` es alias de `AdminRole` (single source of truth en lib/session.ts).
 * No todos los roles tienen entrada en PERMISSIONS — los que no la tengan
 * quedan bloqueados por default (checkPermission retorna false).
 */

import type { AdminRole } from "@/lib/session";

export type Role = AdminRole;
export type Action = "read" | "write" | "delete";
export type Resource =
  | "orders"
  | "products"
  | "customers"
  | "reviews"
  | "settings"
  | "promotions"
  | "coupons"
  | "activity-log"
  | "admin-users"
  | "cash-registers"
  | "sales"
  | "inventory"
  | "suppliers"
  | "purchases"
  | "payables"
  | "expenses"
  | "backup"
  | "analytics"
  | "chat"
  | "delivery-slots"
  | "demand-prediction"
  | "bundles"
  | "notifications"
  | "loyalty"
  | "shopping-lists"
  | "auto-reorder"
  | "barcode-lookup"
  | "price-history"
  | "inventory-movements"
  | "returns"
  | "supplier-evaluations"
  | "store_products"
  | "store_orders"
  | "store_analytics"
  | "store_settings"
  | "wholesale_orders"
  | "delivery_assignments";

/**
 * Matriz de permisos: role → resource → actions permitidas
 */
const PERMISSIONS: Partial<Record<Role, Partial<Record<Resource, Action[]>>>> = {
  /**
   * ADMIN - Acceso completo al sistema
   */
  admin: {
    // Gestión de pedidos
    orders: ["read", "write", "delete"],
    
    // Catálogo y productos
    products: ["read", "write", "delete"],
    bundles: ["read", "write", "delete"],
    
    // Clientes y loyalty
    customers: ["read", "write", "delete"],
    loyalty: ["read", "write", "delete"],
    "shopping-lists": ["read", "write", "delete"],
    
    // Reviews y promociones
    reviews: ["read", "write", "delete"],
    promotions: ["read", "write", "delete"],
    coupons: ["read", "write", "delete"],
    
    // Configuración del sistema
    settings: ["read", "write", "delete"],
    "admin-users": ["read", "write", "delete"],
    
    // Finanzas y caja
    "cash-registers": ["read", "write", "delete"],
    sales: ["read", "write", "delete"],
    expenses: ["read", "write", "delete"],
    payables: ["read", "write", "delete"],
    
    // Inventario y compras
    inventory: ["read", "write", "delete"],
    suppliers: ["read", "write", "delete"],
    purchases: ["read", "write", "delete"],
    "inventory-movements": ["read", "write", "delete"],
    "auto-reorder": ["read", "write", "delete"],
    returns: ["read", "write", "delete"],
    "supplier-evaluations": ["read", "write", "delete"],
    
    // Auditoría y analytics
    "activity-log": ["read", "write", "delete"],
    analytics: ["read"],
    backup: ["read"],
    
    // Operaciones
    chat: ["read", "write", "delete"],
    "delivery-slots": ["read", "write", "delete"],
    "demand-prediction": ["read", "write"],
    notifications: ["read", "write", "delete"],
    "barcode-lookup": ["read"],
    "price-history": ["read", "write"],

    // Marketplace
    store_products: ["read", "write", "delete"],
    store_orders: ["read", "write", "delete"],
    store_analytics: ["read"],
    store_settings: ["read", "write", "delete"],
    wholesale_orders: ["read", "write", "delete"],
    delivery_assignments: ["read", "write", "delete"],
  },

  /**
   * CAJERO - Operaciones de venta y atención al cliente
   */
  cajero: {
    // Gestión de pedidos y ventas
    orders: ["read", "write"], // Puede ver y crear/editar pedidos
    sales: ["read", "write"], // Registra ventas en POS
    
    // Catálogo (solo lectura)
    products: ["read"],
    bundles: ["read"],
    
    // Clientes (puede ver y actualizar datos)
    customers: ["read", "write"],
    loyalty: ["read", "write"], // Puede aplicar puntos
    "shopping-lists": ["read"],
    
    // Reviews (lectura)
    reviews: ["read"],
    
    // Promociones (lectura y aplicación)
    promotions: ["read"],
    coupons: ["read", "write"], // Puede aplicar cupones en ventas
    
    // Configuración (solo lectura)
    settings: ["read"],
    
    // Caja
    "cash-registers": ["read", "write"], // Apertura/cierre de caja
    
    // Inventario (solo consulta)
    inventory: ["read"],
    "barcode-lookup": ["read"],
    
    // Auditoría (puede ver logs, no escribir)
    "activity-log": ["read"],
    analytics: ["read"],
    
    // Operaciones
    chat: ["read", "write"], // Chat interno del equipo
    "delivery-slots": ["read", "write"], // Coordina entregas
    notifications: ["read"],
    
    // Devoluciones
    returns: ["read", "write"], // Procesa devoluciones
  },

  /**
   * ALMACENERO - Gestión de inventario y stock
   */
  almacenero: {
    // Pedidos (solo lectura para preparar)
    orders: ["read"],
    
    // Productos e inventario (gestión completa)
    products: ["read", "write"], // Actualiza stock, precios
    bundles: ["read"],
    inventory: ["read", "write", "delete"],
    "inventory-movements": ["read", "write"],
    "auto-reorder": ["read", "write"],
    "barcode-lookup": ["read"],
    "price-history": ["read"],
    
    // Compras y proveedores
    suppliers: ["read", "write"],
    purchases: ["read", "write"],
    payables: ["read"], // Consulta cuentas por pagar
    "supplier-evaluations": ["read", "write"],
    
    // Devoluciones (gestiona físicamente)
    returns: ["read", "write"],
    
    // Clientes (solo consulta)
    customers: ["read"],
    "shopping-lists": ["read"],
    
    // Configuración (solo lectura)
    settings: ["read"],
    
    // Auditoría (puede ver logs de movimientos)
    "activity-log": ["read"],
    
    // Operaciones
    chat: ["read", "write"], // Chat interno
    notifications: ["read"],
  },

  /**
   * PROVEEDOR - Gestión de productos propios y órdenes mayoristas
   */
  proveedor: {
    // Catálogo y productos
    products: ["read", "write"],

    // Inventario (gestión del stock propio)
    inventory: ["read", "write"],

    // Marketplace
    store_products: ["read", "write"],
    store_analytics: ["read"],
    wholesale_orders: ["read", "write"],
  },

  /**
   * DELIVERY - Gestión de asignaciones y entregas
   */
  delivery: {
    // Pedidos (solo lectura para preparar entrega)
    orders: ["read"],

    // Asignaciones de delivery (gestión completa)
    delivery_assignments: ["read", "write"],

    // Clientes (solo consulta de dirección/contacto)
    customers: ["read"],
  },

  /**
   * TIENDA_OWNER - Propietario de tienda en marketplace
   */
  tienda_owner: {
    // Catálogo y productos
    products: ["read", "write"],

    // Pedidos
    orders: ["read", "write"],

    // Clientes
    customers: ["read", "write"],

    // Analytics (solo lectura)
    analytics: ["read"],

    // Inventario
    inventory: ["read", "write"],

    // Marketplace (acceso completo a su tienda)
    store_products: ["read", "write", "delete"],
    store_orders: ["read", "write"],
    store_analytics: ["read"],
    store_settings: ["read", "write"],
  },
};

/**
 * Verifica si un rol tiene permiso para realizar una acción sobre un recurso
 * 
 * @param role - Rol del usuario (admin, cajero, almacenero)
 * @param resource - Recurso al que se intenta acceder
 * @param action - Acción que se intenta realizar (read, write, delete)
 * @returns true si el rol tiene permiso, false en caso contrario
 * 
 * @example
 * checkPermission("cajero", "products", "write") // false
 * checkPermission("cajero", "products", "read")  // true
 * checkPermission("admin", "settings", "write")  // true
 */
export function checkPermission(
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  const rolePermissions = PERMISSIONS[role];
  if (!rolePermissions) return false;

  const resourceActions = rolePermissions[resource];
  if (!resourceActions) return false;

  return resourceActions.includes(action);
}

/**
 * Obtiene todas las acciones permitidas para un rol sobre un recurso
 * 
 * @param role - Rol del usuario
 * @param resource - Recurso a consultar
 * @returns Array de acciones permitidas
 * 
 * @example
 * getAllowedActions("cajero", "orders") // ["read", "write"]
 * getAllowedActions("almacenero", "orders") // ["read"]
 */
export function getAllowedActions(role: Role, resource: Resource): Action[] {
  const rolePermissions = PERMISSIONS[role];
  if (!rolePermissions) return [];

  return rolePermissions[resource] || [];
}

/**
 * Verifica si un rol tiene algún permiso sobre un recurso
 * 
 * @param role - Rol del usuario
 * @param resource - Recurso a consultar
 * @returns true si tiene al menos una acción permitida
 */
export function hasAnyPermission(role: Role, resource: Resource): boolean {
  return getAllowedActions(role, resource).length > 0;
}

/**
 * Obtiene todos los recursos a los que un rol tiene acceso
 * 
 * @param role - Rol del usuario
 * @returns Array de recursos accesibles
 */
export function getAccessibleResources(role: Role): Resource[] {
  const rolePermissions = PERMISSIONS[role];
  if (!rolePermissions) return [];

  return Object.keys(rolePermissions) as Resource[];
}

/**
 * Helper para verificar permisos de lectura (action: "read")
 */
export function canRead(role: Role, resource: Resource): boolean {
  return checkPermission(role, resource, "read");
}

/**
 * Helper para verificar permisos de escritura (action: "write")
 */
export function canWrite(role: Role, resource: Resource): boolean {
  return checkPermission(role, resource, "write");
}

/**
 * Helper para verificar permisos de eliminación (action: "delete")
 */
export function canDelete(role: Role, resource: Resource): boolean {
  return checkPermission(role, resource, "delete");
}

/**
 * Mapeo de rutas API a recursos para facilitar validación en middleware
 */
export const API_RESOURCE_MAP: Record<string, Resource> = {
  "/api/orders": "orders",
  "/api/products": "products",
  "/api/customers": "customers",
  "/api/reviews": "reviews",
  "/api/settings": "settings",
  "/api/promotions": "promotions",
  "/api/coupons": "coupons",
  "/api/activity-log": "activity-log",
  "/api/admin-users": "admin-users",
  "/api/cash-registers": "cash-registers",
  "/api/sales": "sales",
  "/api/suppliers": "suppliers",
  "/api/purchases": "purchases",
  "/api/payables": "payables",
  "/api/expenses": "expenses",
  "/api/backup": "backup",
  "/api/admin/dashboard": "analytics",
  "/api/admin/stats": "analytics",
  "/api/admin-chat": "chat",
  "/api/delivery-slots": "delivery-slots",
  "/api/demand-prediction": "demand-prediction",
  "/api/bundles": "bundles",
  "/api/notifications": "notifications",
  "/api/loyalty": "loyalty",
  "/api/shopping-lists": "shopping-lists",
  "/api/auto-reorder": "auto-reorder",
  "/api/barcode-lookup": "barcode-lookup",
  "/api/price-history": "price-history",
  "/api/inventory-movements": "inventory-movements",
  "/api/returns": "returns",
  "/api/supplier-evaluations": "supplier-evaluations",
  "/api/store/products": "store_products",
  "/api/store/orders": "store_orders",
  "/api/store/analytics": "store_analytics",
  "/api/store/settings": "store_settings",
  "/api/wholesale/orders": "wholesale_orders",
  "/api/delivery/assignments": "delivery_assignments",
};

/**
 * Mapeo de métodos HTTP a acciones RBAC
 */
export const HTTP_METHOD_TO_ACTION: Record<string, Action> = {
  GET: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "delete",
};

/**
 * Listas predefinidas de roles permitidos por recurso y acción
 * Usadas directamente en endpoints para validación consistente
 */
export const ALLOWED_ROLES = {
  // Chat interno del equipo
  CHAT_READ: ["admin", "cajero", "almacenero"] as Role[],
  CHAT_WRITE: ["admin", "cajero", "almacenero"] as Role[],
  
  // Delivery slots (coordinación de entregas)
  DELIVERY_SLOTS_READ: ["admin", "cajero"] as Role[],
  DELIVERY_SLOTS_WRITE: ["admin", "cajero"] as Role[],
  
  // Bundles (paquetes promocionales)
  BUNDLES_READ: ["admin", "cajero"] as Role[], // Cajero puede ver para vender
  BUNDLES_WRITE: ["admin"] as Role[], // Solo admin crea/edita
  
  // Demand prediction (análisis de negocio sensible)
  DEMAND_PREDICTION: ["admin"] as Role[],
  
  // Backup (solo lectura para admin)
  BACKUP: ["admin"] as Role[],
  
  // Settings (configuración global)
  SETTINGS_READ: ["admin", "cajero", "almacenero"] as Role[], // Todos pueden consultar
  SETTINGS_WRITE: ["admin"] as Role[], // Solo admin modifica
  
  // Activity log
  ACTIVITY_LOG_READ: ["admin", "cajero", "almacenero"] as Role[],
  ACTIVITY_LOG_WRITE: ["admin"] as Role[],
  
  // Admin users management
  ADMIN_USERS: ["admin"] as Role[],
  
  // Sales (POS operations)
  SALES: ["admin", "cajero"] as Role[],
  
  // Inventory operations
  INVENTORY_READ: ["admin", "cajero", "almacenero"] as Role[],
  INVENTORY_WRITE: ["admin", "almacenero"] as Role[],
  
  // Suppliers
  SUPPLIERS: ["admin", "almacenero"] as Role[],
  
  // Purchase orders
  PURCHASES: ["admin", "almacenero"] as Role[],
  
  // Analytics dashboards
  ANALYTICS: ["admin"] as Role[],

  // Marketplace — store products
  STORE_PRODUCTS_READ: ["admin", "proveedor", "tienda_owner"] as Role[],
  STORE_PRODUCTS_WRITE: ["admin", "proveedor", "tienda_owner"] as Role[],
  STORE_PRODUCTS_DELETE: ["admin", "tienda_owner"] as Role[],

  // Marketplace — store orders
  STORE_ORDERS_READ: ["admin", "tienda_owner"] as Role[],
  STORE_ORDERS_WRITE: ["admin", "tienda_owner"] as Role[],

  // Marketplace — store analytics
  STORE_ANALYTICS: ["admin", "proveedor", "tienda_owner"] as Role[],

  // Marketplace — store settings
  STORE_SETTINGS_READ: ["admin", "tienda_owner"] as Role[],
  STORE_SETTINGS_WRITE: ["admin", "tienda_owner"] as Role[],

  // Wholesale orders (B2B)
  WHOLESALE_ORDERS_READ: ["admin", "proveedor"] as Role[],
  WHOLESALE_ORDERS_WRITE: ["admin", "proveedor"] as Role[],

  // Delivery assignments
  DELIVERY_ASSIGNMENTS_READ: ["admin", "delivery"] as Role[],
  DELIVERY_ASSIGNMENTS_WRITE: ["admin", "delivery"] as Role[],
};
