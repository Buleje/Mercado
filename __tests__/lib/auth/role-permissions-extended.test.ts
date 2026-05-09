/**
 * Tests RBAC extendidos — roles delivery, tienda_owner, owner, manager, analista
 *
 * Round 26 (2026-05-09) — cierra QA gap #1 reportado en round 21:
 * la matriz de permisos solo cubría admin/cajero/almacenero antes.
 *
 * Hallazgo importante (documentado): owner, manager, analista existen en
 * AdminRole type (lib/session.ts:78-80) pero NO en PERMISSIONS object
 * (lib/auth/role-permissions.ts). Resultado: usuarios asignados a estos
 * roles reciben false en TODAS las verificaciones — están bloqueados de
 * facto. Es un bug de planificación (roles definidos pero no configurados).
 * Tests verifican el comportamiento actual y dejan baseline para cuando
 * se configuren.
 */
import { describe, it, expect } from "vitest";
import {
  checkPermission,
  canRead,
  canWrite,
  canDelete,
  hasAnyPermission,
  getAccessibleResources,
} from "@/lib/auth/role-permissions";

describe("RBAC — role: delivery", () => {
  it("puede leer orders pero NO escribirlos ni borrarlos", () => {
    expect(canRead("delivery", "orders")).toBe(true);
    expect(canWrite("delivery", "orders")).toBe(false);
    expect(canDelete("delivery", "orders")).toBe(false);
  });

  it("puede leer + escribir delivery_assignments (gestión completa)", () => {
    expect(canRead("delivery", "delivery_assignments")).toBe(true);
    expect(canWrite("delivery", "delivery_assignments")).toBe(true);
    expect(canDelete("delivery", "delivery_assignments")).toBe(false);
  });

  it("puede leer customers (dirección de entrega) pero NO modificar", () => {
    expect(canRead("delivery", "customers")).toBe(true);
    expect(canWrite("delivery", "customers")).toBe(false);
  });

  it("NO puede acceder a settings, products, suppliers, finanzas", () => {
    expect(hasAnyPermission("delivery", "settings")).toBe(false);
    expect(hasAnyPermission("delivery", "products")).toBe(false);
    expect(hasAnyPermission("delivery", "suppliers")).toBe(false);
    expect(hasAnyPermission("delivery", "finanzas")).toBe(false);
  });

  it("getAccessibleResources devuelve solo orders + delivery_assignments + customers", () => {
    const allowed = getAccessibleResources("delivery").sort();
    expect(allowed).toEqual(["customers", "delivery_assignments", "orders"]);
  });
});

describe("RBAC — role: tienda_owner", () => {
  it("puede leer + escribir products + orders + customers + inventory", () => {
    expect(canRead("tienda_owner", "products")).toBe(true);
    expect(canWrite("tienda_owner", "products")).toBe(true);
    expect(canRead("tienda_owner", "orders")).toBe(true);
    expect(canWrite("tienda_owner", "orders")).toBe(true);
    expect(canRead("tienda_owner", "customers")).toBe(true);
    expect(canWrite("tienda_owner", "customers")).toBe(true);
    expect(canRead("tienda_owner", "inventory")).toBe(true);
    expect(canWrite("tienda_owner", "inventory")).toBe(true);
  });

  it("puede leer analytics pero NO escribirlos (solo lectura)", () => {
    expect(canRead("tienda_owner", "analytics")).toBe(true);
    expect(canWrite("tienda_owner", "analytics")).toBe(false);
  });

  it("tiene control completo (read+write+delete) sobre store_products", () => {
    expect(canRead("tienda_owner", "store_products")).toBe(true);
    expect(canWrite("tienda_owner", "store_products")).toBe(true);
    expect(canDelete("tienda_owner", "store_products")).toBe(true);
  });

  it("puede leer + escribir store_orders (su propio negocio)", () => {
    expect(canRead("tienda_owner", "store_orders")).toBe(true);
    expect(canWrite("tienda_owner", "store_orders")).toBe(true);
  });

  it("solo lectura en store_analytics", () => {
    expect(canRead("tienda_owner", "store_analytics")).toBe(true);
    expect(canWrite("tienda_owner", "store_analytics")).toBe(false);
  });

  it("NO puede acceder a recursos plataforma (suppliers, finanzas, settings globales)", () => {
    expect(hasAnyPermission("tienda_owner", "suppliers")).toBe(false);
    expect(hasAnyPermission("tienda_owner", "finanzas")).toBe(false);
    expect(hasAnyPermission("tienda_owner", "settings")).toBe(false);
  });
});

describe("RBAC — roles sin PERMISSIONS configurado (deny-by-default)", () => {
  // owner, manager, analista existen en AdminRole pero NO en PERMISSIONS.
  // checkPermission retorna false → usuarios bloqueados de facto.
  // TD-047: estos roles necesitan configuración antes de habilitar UI.

  it("owner: deny-by-default (no PERMISSIONS configurado)", () => {
    expect(checkPermission("owner", "orders", "read")).toBe(false);
    expect(checkPermission("owner", "products", "read")).toBe(false);
    expect(checkPermission("owner", "settings", "read")).toBe(false);
    expect(getAccessibleResources("owner")).toEqual([]);
  });

  it("manager: deny-by-default (no PERMISSIONS configurado)", () => {
    expect(checkPermission("manager", "orders", "read")).toBe(false);
    expect(checkPermission("manager", "analytics", "read")).toBe(false);
    expect(getAccessibleResources("manager")).toEqual([]);
  });

  it("analista: deny-by-default (no PERMISSIONS configurado)", () => {
    expect(checkPermission("analista", "analytics", "read")).toBe(false);
    expect(checkPermission("analista", "orders", "read")).toBe(false);
    expect(getAccessibleResources("analista")).toEqual([]);
  });

  it("superadmin: NO configurado en PERMISSIONS — auth flow lo maneja por separado", () => {
    // superadmin existe en AdminRole type pero usa platform-session distinto
    // (getPlatformSession) — checkPermission no aplica.
    expect(checkPermission("superadmin", "orders", "read")).toBe(false);
  });
});

describe("RBAC — roles desconocidos retornan deny", () => {
  it("rol no existente cae a deny-by-default", () => {
    // @ts-expect-error testing runtime safety con rol fuera del type
    expect(checkPermission("hacker_attempt", "orders", "read")).toBe(false);
  });
});
