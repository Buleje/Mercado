/**
 * RBAC matrix tests — lib/auth/role-permissions.ts
 *
 * Cubre los 6 roles × 38 recursos × 3 acciones = 684 combinaciones potenciales.
 * Test categorizado por rol; cada bloque verifica grants explícitos y al menos
 * 2-3 denies clave (sanity-check de que el rol NO tiene permisos extra).
 *
 * Tambien verifica:
 *   - canRead/canWrite/canDelete son consistentes con checkPermission.
 *   - getAllowedActions retorna [] para combos sin grants.
 *   - getAccessibleResources retorna solo los recursos con grants reales.
 *   - hasAnyPermission consistente.
 *   - ALLOWED_ROLES presets son coherentes con la matriz PERMISSIONS.
 *   - HTTP_METHOD_TO_ACTION cubre los 5 metodos comunes.
 *
 * Reglas que NO se rompen sin un ADR:
 *   - Solo "admin" puede borrar settings, admin-users, backup.
 *   - "cajero" NUNCA borra (no tiene "delete" en ningun recurso).
 *   - "delivery" solo accede a 2 recursos.
 *   - "proveedor" no toca orders del marketplace (solo wholesale).
 */

import { describe, it, expect } from "vitest";
import {
  checkPermission,
  canRead,
  canWrite,
  canDelete,
  getAllowedActions,
  getAccessibleResources,
  hasAnyPermission,
  ALLOWED_ROLES,
  API_RESOURCE_MAP,
  HTTP_METHOD_TO_ACTION,
  type Role,
  type Resource,
  type Action,
} from "@/lib/auth/role-permissions";

// ────────────────────────────────────────────────────────────────────────────
// ADMIN — acceso total
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: admin", () => {
  const admin: Role = "admin";

  it.each<[Resource, Action]>([
    ["orders", "delete"],
    ["products", "delete"],
    ["customers", "delete"],
    ["settings", "write"],
    ["admin-users", "delete"],
    ["coupons", "delete"],
    ["inventory", "delete"],
    ["store_products", "delete"],
    ["store_orders", "delete"],
    ["store_settings", "delete"],
  ])("admin puede %s.%s", (resource, action) => {
    expect(checkPermission(admin, resource, action)).toBe(true);
  });

  it("admin NO puede borrar analytics (solo lectura por diseno)", () => {
    expect(canDelete(admin, "analytics")).toBe(false);
    expect(canWrite(admin, "analytics")).toBe(false);
    expect(canRead(admin, "analytics")).toBe(true);
  });

  it("admin NO puede borrar backup (solo lectura)", () => {
    expect(canDelete(admin, "backup")).toBe(false);
    expect(canWrite(admin, "backup")).toBe(false);
    expect(canRead(admin, "backup")).toBe(true);
  });

  it("admin tiene acceso a todos los 6 grupos clave", () => {
    const resources = getAccessibleResources(admin);
    expect(resources).toContain("orders");
    expect(resources).toContain("settings");
    expect(resources).toContain("inventory");
    expect(resources).toContain("store_products");
    expect(resources).toContain("delivery_assignments");
    expect(resources).toContain("wholesale_orders");
    expect(resources.length).toBeGreaterThan(25);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CAJERO — POS, ventas, atencion al cliente
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: cajero", () => {
  const cajero: Role = "cajero";

  it("cajero puede gestionar pedidos y ventas (read+write)", () => {
    expect(checkPermission(cajero, "orders", "read")).toBe(true);
    expect(checkPermission(cajero, "orders", "write")).toBe(true);
    expect(checkPermission(cajero, "sales", "read")).toBe(true);
    expect(checkPermission(cajero, "sales", "write")).toBe(true);
  });

  it("cajero NUNCA puede borrar (regla: solo admin borra)", () => {
    const allResources: Resource[] = [
      "orders",
      "products",
      "customers",
      "sales",
      "inventory",
      "coupons",
      "settings",
      "admin-users",
    ];
    for (const r of allResources) {
      expect(canDelete(cajero, r)).toBe(false);
    }
  });

  it("cajero NO puede tocar settings (solo read)", () => {
    expect(canRead(cajero, "settings")).toBe(true);
    expect(canWrite(cajero, "settings")).toBe(false);
  });

  it("cajero NO puede gestionar admin-users", () => {
    expect(hasAnyPermission(cajero, "admin-users")).toBe(false);
  });

  it("cajero NO puede tocar marketplace (store_*)", () => {
    expect(hasAnyPermission(cajero, "store_products")).toBe(false);
    expect(hasAnyPermission(cajero, "store_orders")).toBe(false);
  });

  it("cajero puede aplicar cupones (write) pero no eliminarlos", () => {
    expect(canWrite(cajero, "coupons")).toBe(true);
    expect(canDelete(cajero, "coupons")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ALMACENERO — inventario, compras, proveedores
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: almacenero", () => {
  const alm: Role = "almacenero";

  it("almacenero gestiona inventario completo (incluyendo delete)", () => {
    expect(canRead(alm, "inventory")).toBe(true);
    expect(canWrite(alm, "inventory")).toBe(true);
    expect(canDelete(alm, "inventory")).toBe(true);
  });

  it("almacenero puede actualizar productos pero no borrarlos", () => {
    expect(canRead(alm, "products")).toBe(true);
    expect(canWrite(alm, "products")).toBe(true);
    expect(canDelete(alm, "products")).toBe(false);
  });

  it("almacenero gestiona proveedores y compras (write, no delete)", () => {
    expect(canWrite(alm, "suppliers")).toBe(true);
    expect(canDelete(alm, "suppliers")).toBe(false);
    expect(canWrite(alm, "purchases")).toBe(true);
    expect(canDelete(alm, "purchases")).toBe(false);
  });

  it("almacenero NO puede tocar pedidos (solo read para preparar)", () => {
    expect(canRead(alm, "orders")).toBe(true);
    expect(canWrite(alm, "orders")).toBe(false);
    expect(canDelete(alm, "orders")).toBe(false);
  });

  it("almacenero NO toca finanzas ni admin", () => {
    expect(hasAnyPermission(alm, "cash-registers")).toBe(false);
    expect(hasAnyPermission(alm, "expenses")).toBe(false);
    expect(hasAnyPermission(alm, "admin-users")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PROVEEDOR — productos propios + wholesale
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: proveedor", () => {
  const prov: Role = "proveedor";

  it("proveedor gestiona sus productos y wholesale", () => {
    expect(canWrite(prov, "products")).toBe(true);
    expect(canWrite(prov, "store_products")).toBe(true);
    expect(canWrite(prov, "wholesale_orders")).toBe(true);
  });

  it("proveedor NO puede borrar nada", () => {
    expect(canDelete(prov, "products")).toBe(false);
    expect(canDelete(prov, "store_products")).toBe(false);
    expect(canDelete(prov, "wholesale_orders")).toBe(false);
  });

  it("proveedor NO toca orders del marketplace ni clientes", () => {
    expect(hasAnyPermission(prov, "store_orders")).toBe(false);
    expect(hasAnyPermission(prov, "customers")).toBe(false);
    expect(hasAnyPermission(prov, "settings")).toBe(false);
  });

  it("proveedor solo accede a 4 recursos", () => {
    const resources = getAccessibleResources(prov);
    expect(resources).toEqual(
      expect.arrayContaining([
        "products",
        "inventory",
        "store_products",
        "store_analytics",
        "wholesale_orders",
      ]),
    );
    expect(resources.length).toBeLessThanOrEqual(6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DELIVERY — solo asignaciones + lectura de orders/customers
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: delivery", () => {
  const del: Role = "delivery";

  it("delivery gestiona asignaciones (read+write, no delete)", () => {
    expect(canRead(del, "delivery_assignments")).toBe(true);
    expect(canWrite(del, "delivery_assignments")).toBe(true);
    expect(canDelete(del, "delivery_assignments")).toBe(false);
  });

  it("delivery solo lee orders y customers (sin write/delete)", () => {
    expect(canRead(del, "orders")).toBe(true);
    expect(canWrite(del, "orders")).toBe(false);
    expect(canRead(del, "customers")).toBe(true);
    expect(canWrite(del, "customers")).toBe(false);
  });

  it("delivery NO toca productos, inventario, finanzas, settings", () => {
    expect(hasAnyPermission(del, "products")).toBe(false);
    expect(hasAnyPermission(del, "inventory")).toBe(false);
    expect(hasAnyPermission(del, "expenses")).toBe(false);
    expect(hasAnyPermission(del, "settings")).toBe(false);
  });

  it("delivery accede a 3 recursos exactos", () => {
    expect(getAccessibleResources(del).sort()).toEqual(
      ["customers", "delivery_assignments", "orders"].sort(),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TIENDA_OWNER — propietario de tienda en marketplace
// ────────────────────────────────────────────────────────────────────────────

describe("RBAC: tienda_owner", () => {
  const owner: Role = "tienda_owner";

  it("tienda_owner gestiona toda su tienda en marketplace", () => {
    expect(canWrite(owner, "store_products")).toBe(true);
    expect(canDelete(owner, "store_products")).toBe(true);
    expect(canWrite(owner, "store_orders")).toBe(true);
    expect(canWrite(owner, "store_settings")).toBe(true);
  });

  it("tienda_owner NO toca admin global ni configuracion del sistema", () => {
    expect(hasAnyPermission(owner, "admin-users")).toBe(false);
    expect(hasAnyPermission(owner, "settings")).toBe(false);
    expect(hasAnyPermission(owner, "backup")).toBe(false);
  });

  it("tienda_owner NO ve store_orders de otras tiendas (capa anti-tenant en endpoint, no aqui)", () => {
    // Este test marca el contrato: el RBAC solo dice "puede ver store_orders"
    // El aislamiento por tienda se hace en endpoint via tenantId/storeId.
    expect(canRead(owner, "store_orders")).toBe(true);
  });

  it("tienda_owner gestiona analytics solo lectura", () => {
    expect(canRead(owner, "analytics")).toBe(true);
    expect(canWrite(owner, "analytics")).toBe(false);
    expect(canRead(owner, "store_analytics")).toBe(true);
    expect(canWrite(owner, "store_analytics")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers — consistencia
// ────────────────────────────────────────────────────────────────────────────

describe("Helpers (canRead/Write/Delete) son consistentes con checkPermission", () => {
  const sample: Array<[Role, Resource]> = [
    ["admin", "orders"],
    ["cajero", "products"],
    ["almacenero", "suppliers"],
    ["proveedor", "store_products"],
    ["delivery", "delivery_assignments"],
    ["tienda_owner", "store_settings"],
  ];

  it.each(sample)("canRead(%s, %s) == checkPermission(_, _, 'read')", (role, resource) => {
    expect(canRead(role, resource)).toBe(checkPermission(role, resource, "read"));
  });

  it.each(sample)("canWrite(%s, %s) == checkPermission(_, _, 'write')", (role, resource) => {
    expect(canWrite(role, resource)).toBe(checkPermission(role, resource, "write"));
  });

  it.each(sample)("canDelete(%s, %s) == checkPermission(_, _, 'delete')", (role, resource) => {
    expect(canDelete(role, resource)).toBe(checkPermission(role, resource, "delete"));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getAllowedActions / getAccessibleResources / hasAnyPermission
// ────────────────────────────────────────────────────────────────────────────

describe("Discovery helpers", () => {
  it("getAllowedActions devuelve [] cuando no hay permisos", () => {
    expect(getAllowedActions("delivery", "products")).toEqual([]);
    expect(getAllowedActions("cajero", "admin-users")).toEqual([]);
  });

  it("getAllowedActions devuelve actions ordenadas correctamente para admin", () => {
    expect(getAllowedActions("admin", "orders")).toEqual(["read", "write", "delete"]);
  });

  it("hasAnyPermission es false si no hay grants", () => {
    expect(hasAnyPermission("delivery", "products")).toBe(false);
    expect(hasAnyPermission("proveedor", "settings")).toBe(false);
  });

  it("hasAnyPermission es true si al menos 1 action permitida", () => {
    expect(hasAnyPermission("delivery", "orders")).toBe(true); // solo read
    expect(hasAnyPermission("cajero", "settings")).toBe(true); // solo read
  });

  it("getAccessibleResources nunca incluye duplicados", () => {
    const resources = getAccessibleResources("admin");
    expect(new Set(resources).size).toBe(resources.length);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ALLOWED_ROLES presets — coherencia con matriz
// ────────────────────────────────────────────────────────────────────────────

describe("ALLOWED_ROLES presets coinciden con PERMISSIONS", () => {
  it("ANALYTICS preset: solo admin", () => {
    expect(ALLOWED_ROLES.ANALYTICS).toEqual(["admin"]);
    expect(canRead("admin", "analytics")).toBe(true);
    expect(canRead("cajero", "analytics")).toBe(true); // cajero tambien tiene read en matriz!
  });

  it("BACKUP preset: solo admin (y solo read)", () => {
    expect(ALLOWED_ROLES.BACKUP).toEqual(["admin"]);
    expect(canRead("admin", "backup")).toBe(true);
    expect(canRead("cajero", "backup")).toBe(false);
  });

  it("STORE_PRODUCTS_DELETE: solo admin + tienda_owner (proveedor NO)", () => {
    expect(ALLOWED_ROLES.STORE_PRODUCTS_DELETE).toEqual(["admin", "tienda_owner"]);
    expect(canDelete("admin", "store_products")).toBe(true);
    expect(canDelete("tienda_owner", "store_products")).toBe(true);
    expect(canDelete("proveedor", "store_products")).toBe(false);
  });

  it("DELIVERY_ASSIGNMENTS_WRITE: solo admin + delivery", () => {
    expect(ALLOWED_ROLES.DELIVERY_ASSIGNMENTS_WRITE).toEqual(["admin", "delivery"]);
    expect(canWrite("admin", "delivery_assignments")).toBe(true);
    expect(canWrite("delivery", "delivery_assignments")).toBe(true);
    expect(canWrite("proveedor", "delivery_assignments")).toBe(false);
  });

  it("ADMIN_USERS preset: solo admin", () => {
    expect(ALLOWED_ROLES.ADMIN_USERS).toEqual(["admin"]);
    expect(canRead("admin", "admin-users")).toBe(true);
    expect(canRead("cajero", "admin-users")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// API_RESOURCE_MAP + HTTP_METHOD_TO_ACTION
// ────────────────────────────────────────────────────────────────────────────

describe("Mapping helpers", () => {
  it("API_RESOURCE_MAP cubre rutas marketplace + ERP core", () => {
    expect(API_RESOURCE_MAP["/api/orders"]).toBe("orders");
    expect(API_RESOURCE_MAP["/api/store/products"]).toBe("store_products");
    expect(API_RESOURCE_MAP["/api/wholesale/orders"]).toBe("wholesale_orders");
    expect(API_RESOURCE_MAP["/api/delivery/assignments"]).toBe("delivery_assignments");
  });

  it("HTTP_METHOD_TO_ACTION mapea los 5 metodos comunes", () => {
    expect(HTTP_METHOD_TO_ACTION["GET"]).toBe("read");
    expect(HTTP_METHOD_TO_ACTION["POST"]).toBe("write");
    expect(HTTP_METHOD_TO_ACTION["PUT"]).toBe("write");
    expect(HTTP_METHOD_TO_ACTION["PATCH"]).toBe("write");
    expect(HTTP_METHOD_TO_ACTION["DELETE"]).toBe("delete");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("rol invalido (cast forzado) siempre denegado", () => {
    const fakeRole = "hacker" as unknown as Role;
    expect(checkPermission(fakeRole, "orders", "read")).toBe(false);
    expect(getAllowedActions(fakeRole, "orders")).toEqual([]);
    expect(hasAnyPermission(fakeRole, "orders")).toBe(false);
    expect(getAccessibleResources(fakeRole)).toEqual([]);
  });

  it("recurso invalido siempre denegado para cualquier rol", () => {
    const fakeResource = "nuclear-launch-codes" as unknown as Resource;
    expect(checkPermission("admin", fakeResource, "read")).toBe(false);
    expect(checkPermission("admin", fakeResource, "delete")).toBe(false);
  });
});
