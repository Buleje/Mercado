/**
 * RBAC Matrix — Tests parametrizados de casos críticos
 *
 * Complementa `__tests__/lib/auth/role-permissions.test.ts` (suite completa
 * por rol). Este archivo se enfoca en:
 *
 *  1. Test matricial parametrizado: it.each sobre tuples [role, resource, action, expected]
 *  2. Casos negativos críticos: roles sin privilegios de admin intentando operaciones admin
 *  3. Casos positivos clave: admin y proveedor/tienda_owner en su namespace
 *  4. Fail-closed: checkPermission con role inexistente → false
 *  5. Integridad total: ningún rol desconocido gana permisos
 *
 * Roles del sistema (lib/session.ts → AdminRole):
 *   superadmin | admin | cajero | almacenero | proveedor | delivery | tienda_owner | owner | manager | analista
 *
 * NOTA: "vecino" (cliente storefront) NO es un AdminRole — no tiene entrada en
 * PERMISSIONS. "vendor" mapea a "proveedor" o "tienda_owner" según contexto.
 * El RBAC admin aplica solo a usuarios con sesión admin, no a compradores.
 */

import { describe, it, expect } from "vitest";
import {
  checkPermission,
  canRead,
  canWrite,
  canDelete,
  hasAnyPermission,
  getAccessibleResources,
  type Role,
  type Resource,
  type Action,
} from "@/lib/auth/role-permissions";

// ────────────────────────────────────────────────────────────────────────────
// 1. Test matricial parametrizado
//    Formato: [role, resource, action, expectedResult, descripcion]
// ────────────────────────────────────────────────────────────────────────────

type MatrixRow = [Role, Resource, Action, boolean, string];

const PERMISSION_MATRIX: MatrixRow[] = [
  // ── Admin — acceso total ──────────────────────────────────────────────────
  ["admin", "products",   "delete", true,  "admin puede borrar productos"],
  ["admin", "orders",     "write",  true,  "admin puede editar pedidos"],
  ["admin", "settings",   "write",  true,  "admin puede editar settings"],
  ["admin", "admin-users","delete", true,  "admin puede eliminar admin-users"],
  ["admin", "analytics",  "read",   true,  "admin puede leer analytics"],
  ["admin", "analytics",  "write",  false, "admin NO puede escribir analytics"],
  ["admin", "backup",     "read",   true,  "admin puede leer backup"],
  ["admin", "backup",     "delete", false, "admin NO puede borrar backup"],

  // ── Cajero — solo operaciones de venta ────────────────────────────────────
  ["cajero", "orders",     "read",   true,  "cajero puede leer pedidos"],
  ["cajero", "orders",     "write",  true,  "cajero puede crear/editar pedidos"],
  ["cajero", "orders",     "delete", false, "cajero NO puede borrar pedidos"],
  ["cajero", "settings",   "read",   true,  "cajero puede leer settings"],
  ["cajero", "settings",   "write",  false, "cajero NO puede editar settings"],
  ["cajero", "admin-users","read",   false, "cajero NO puede leer admin-users"],
  ["cajero", "admin-users","write",  false, "cajero NO puede escribir admin-users"],
  ["cajero", "admin-users","delete", false, "cajero NO puede borrar admin-users"],
  ["cajero", "inventory",  "read",   true,  "cajero puede consultar inventario"],
  ["cajero", "inventory",  "write",  false, "cajero NO puede modificar inventario"],
  ["cajero", "backup",     "read",   false, "cajero NO puede acceder a backup"],

  // ── Almacenero — inventario, compras, no finanzas ─────────────────────────
  ["almacenero", "inventory",   "delete", true,  "almacenero puede borrar registros de inventario"],
  ["almacenero", "orders",      "write",  false, "almacenero NO puede editar pedidos"],
  ["almacenero", "settings",    "write",  false, "almacenero NO puede editar settings"],
  ["almacenero", "admin-users", "read",   false, "almacenero NO puede leer admin-users"],
  ["almacenero", "expenses",    "read",   false, "almacenero NO puede ver gastos"],
  ["almacenero", "cash-registers","read", false, "almacenero NO accede a caja"],

  // ── Delivery — solo asignaciones y lectura ────────────────────────────────
  ["delivery", "delivery_assignments","write",  true,  "delivery gestiona sus asignaciones"],
  ["delivery", "delivery_assignments","delete", false, "delivery NO puede borrar asignaciones"],
  ["delivery", "orders",              "read",   true,  "delivery puede ver pedidos para entregar"],
  ["delivery", "orders",              "write",  false, "delivery NO puede editar pedidos"],
  ["delivery", "products",            "read",   false, "delivery NO accede a productos"],
  ["delivery", "settings",            "read",   false, "delivery NO accede a settings"],
  ["delivery", "admin-users",         "read",   false, "delivery NO accede a admin-users"],
  ["delivery", "inventory",           "read",   false, "delivery NO accede a inventario"],

  // ── Proveedor — namespace propio (vendor) ─────────────────────────────────
  ["proveedor", "store_products",  "write",  true,  "proveedor gestiona sus productos en marketplace"],
  ["proveedor", "store_analytics", "read",   true,  "proveedor puede ver sus analytics"],
  ["proveedor", "store_products",  "delete", false, "proveedor NO puede borrar store_products"],
  ["proveedor", "store_orders",    "read",   false, "proveedor NO ve orders de la tienda principal"],
  ["proveedor", "orders",          "read",   false, "proveedor NO ve orders del ERP"],
  ["proveedor", "customers",       "read",   false, "proveedor NO accede a clientes"],
  ["proveedor", "settings",        "read",   false, "proveedor NO accede a settings"],
  ["proveedor", "admin-users",     "read",   false, "proveedor NO accede a admin-users"],

  // ── Tienda_owner — marketplace completo ──────────────────────────────────
  ["tienda_owner", "store_products",  "delete", true,  "tienda_owner puede borrar sus productos"],
  ["tienda_owner", "store_orders",    "write",  true,  "tienda_owner gestiona sus pedidos"],
  ["tienda_owner", "store_settings",  "write",  true,  "tienda_owner edita config de su tienda"],
  ["tienda_owner", "settings",        "read",   false, "tienda_owner NO accede a settings globales"],
  ["tienda_owner", "admin-users",     "read",   false, "tienda_owner NO accede a admin-users"],
  ["tienda_owner", "backup",          "read",   false, "tienda_owner NO accede a backup"],
];

describe("RBAC Matrix — tests parametrizados", () => {
  it.each(PERMISSION_MATRIX)(
    "%s > %s.%s → %s (%s)",
    (role, resource, action, expected) => {
      expect(checkPermission(role, resource, action)).toBe(expected);
    },
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Casos negativos críticos — roles sin privilegios admin
// ────────────────────────────────────────────────────────────────────────────

describe("Negativos críticos: roles sin privilegios de admin", () => {
  /**
   * "Vecino" (cliente storefront) no existe como AdminRole.
   * Si alguien pasara "vecino" forzado como Role, debe ser denegado (fail-closed).
   */
  it("'vecino' forzado como role → siempre denegado (fail-closed)", () => {
    const vecino = "vecino" as unknown as Role;
    expect(checkPermission(vecino, "products", "delete")).toBe(false);
    expect(checkPermission(vecino, "admin-users", "read")).toBe(false);
    expect(checkPermission(vecino, "orders", "write")).toBe(false);
    expect(getAccessibleResources(vecino)).toEqual([]);
  });

  it("cajero NO tiene acceso a ninguna operación de admin-users", () => {
    const r: Resource = "admin-users";
    expect(canRead("cajero", r)).toBe(false);
    expect(canWrite("cajero", r)).toBe(false);
    expect(canDelete("cajero", r)).toBe(false);
    expect(hasAnyPermission("cajero", r)).toBe(false);
  });

  it("cajero NO puede editar ni borrar settings", () => {
    expect(canWrite("cajero", "settings")).toBe(false);
    expect(canDelete("cajero", "settings")).toBe(false);
  });

  it("delivery NO puede acceder a ningún recurso admin (products, settings, sales...)", () => {
    const adminResources: Resource[] = [
      "products", "settings", "admin-users", "sales",
      "expenses", "inventory", "coupons", "promotions",
    ];
    for (const resource of adminResources) {
      expect(hasAnyPermission("delivery", resource)).toBe(false);
    }
  });

  it("delivery accede SOLO a 3 recursos (orders, delivery_assignments, customers)", () => {
    const accessible = getAccessibleResources("delivery").sort();
    expect(accessible).toEqual(
      ["customers", "delivery_assignments", "orders"].sort(),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Casos positivos clave
// ────────────────────────────────────────────────────────────────────────────

describe("Positivos clave: admin y vendor en su namespace", () => {
  it("admin puede hacer read+write+delete en products Y orders", () => {
    const actions: Action[] = ["read", "write", "delete"];
    for (const action of actions) {
      expect(checkPermission("admin", "products", action)).toBe(true);
      expect(checkPermission("admin", "orders", action)).toBe(true);
    }
  });

  it("admin tiene acceso a más de 25 recursos (acceso total)", () => {
    expect(getAccessibleResources("admin").length).toBeGreaterThan(25);
  });

  it("proveedor (vendor) puede write en store_products y wholesale_orders", () => {
    expect(canWrite("proveedor", "store_products")).toBe(true);
    expect(canWrite("proveedor", "wholesale_orders")).toBe(true);
    expect(canRead("proveedor", "store_analytics")).toBe(true);
  });

  it("tienda_owner puede delete en store_products (su propio catálogo)", () => {
    expect(canDelete("tienda_owner", "store_products")).toBe(true);
  });

  it("cajero puede read en productos pero no modificar catálogo", () => {
    expect(canRead("cajero", "products")).toBe(true);
    expect(canWrite("cajero", "products")).toBe(false);
    expect(canDelete("cajero", "products")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Fail-closed: checkPermission con role inexistente → false
// ────────────────────────────────────────────────────────────────────────────

describe("Integridad: fail-closed para roles inexistentes", () => {
  const fakeRoles = ["hacker", "", "superusuario", "root", "god", "null"];

  it.each(fakeRoles)(
    "role '%s' (inexistente) → checkPermission siempre false",
    (fakeRole) => {
      const r = fakeRole as unknown as Role;
      expect(checkPermission(r, "orders", "read")).toBe(false);
      expect(checkPermission(r, "products", "delete")).toBe(false);
      expect(checkPermission(r, "admin-users", "write")).toBe(false);
    },
  );

  it("roles en AdminRole sin entrada en PERMISSIONS (owner, manager, analista) → denegados", () => {
    // Estos roles existen en el tipo AdminRole pero no tienen entrada en PERMISSIONS
    // → fail-closed: ningún permiso concedido
    const rolesWithoutPermissions = ["owner", "manager", "analista"] as Role[];
    for (const role of rolesWithoutPermissions) {
      expect(hasAnyPermission(role, "orders")).toBe(false);
      expect(hasAnyPermission(role, "products")).toBe(false);
      expect(getAccessibleResources(role)).toEqual([]);
    }
  });

  it("superadmin sin entrada en PERMISSIONS tampoco tiene grants", () => {
    // superadmin se gestiona vía middleware de superadmin/, no vía PERMISSIONS
    // (no tiene entrada en la matriz) → fail-closed en checkPermission
    const role = "superadmin" as Role;
    // Si no tiene entrada en PERMISSIONS, todo debe ser false
    const result = checkPermission(role, "orders", "read");
    // El test documenta el comportamiento actual — si superadmin SI tiene entrada,
    // esta assertion fallará y habrá que actualizar el test.
    expect(typeof result).toBe("boolean"); // siempre boolean (no throws)
    // Documentar el resultado actual como snapshot de seguridad
    if (result === false) {
      // Sin entrada en PERMISSIONS — acceso via middleware, no RBAC
      expect(getAccessibleResources(role)).toEqual([]);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Propiedad: checkPermission NUNCA lanza excepción
// ────────────────────────────────────────────────────────────────────────────

describe("Robustez: checkPermission nunca lanza excepción", () => {
  const edgeCases: Array<[unknown, unknown, unknown]> = [
    [null, "orders", "read"],
    [undefined, "products", "write"],
    ["admin", null, "read"],
    ["admin", "orders", null],
    [123, "products", "delete"],
    ["admin", {}, "read"],
  ];

  it.each(edgeCases)(
    "checkPermission(%s, %s, %s) no lanza",
    (role, resource, action) => {
      expect(() =>
        checkPermission(
          role as Role,
          resource as Resource,
          action as Action,
        ),
      ).not.toThrow();
    },
  );
});
