/**
 * Tests — lib/auth/roles-rutas-panel.ts
 *
 * `puedePedir` es la única fuente de verdad de qué roles pueden pedir cada
 * ruta del panel desde el cliente — tiene que devolver EXACTAMENTE lo mismo
 * que `requireAdmin` (lib/require-admin.ts) responde en el servidor: los
 * `allowedRoles` de cada ruta + el bypass de management-tier
 * (admin/owner/manager siempre pasan). Ver cada route.ts bajo app/api para
 * el espejo servidor de cada caso.
 */

import { describe, it, expect } from "vitest";
import { puedePedir, RUTAS_PANEL, type RutaPanel } from "@/lib/auth/roles-rutas-panel";
import type { AdminRole } from "@/lib/session";

const TODOS_LOS_ROLES: AdminRole[] = [
  "superadmin", "admin", "cajero", "almacenero", "proveedor",
  "delivery", "tienda_owner", "owner", "manager", "analista",
];

describe("puedePedir", () => {
  it("rol null (auth todavía en curso) nunca puede pedir nada", () => {
    for (const ruta of Object.keys(RUTAS_PANEL) as RutaPanel[]) {
      expect(puedePedir(ruta, null)).toBe(false);
    }
  });

  it("management-tier (admin/owner/manager) siempre puede, aunque no esté en allowedRoles", () => {
    // /api/customers y /api/admin/stats sólo listan ["admin"] — owner/manager
    // NO aparecen ahí, pero requireAdmin los deja pasar igual (bypass).
    for (const rol of ["admin", "owner", "manager"] as const) {
      expect(puedePedir("/api/customers", rol)).toBe(true);
      expect(puedePedir("/api/admin/stats", rol)).toBe(true);
    }
  });

  it("superadmin NO tiene bypass de management-tier (requireAdmin lo rechaza aparte)", () => {
    // requireAdmin corta con 403 ANTES de evaluar allowedRoles si role==="superadmin"
    // (usa PLATFORM_SESSION, no la cookie admin) — acá sólo importa que no esté
    // en MANAGEMENT_TIER ni listado, para no fingir un permiso que el server niega.
    expect(puedePedir("/api/customers", "superadmin")).toBe(false);
  });

  it.each([
    ["/api/customers", "cajero", false],
    ["/api/customers", "almacenero", false],
    ["/api/sales", "cajero", true],
    ["/api/sales", "tienda_owner", true],
    ["/api/sales", "almacenero", false],
    ["/api/admin/alerts-summary", "cajero", true],
    ["/api/admin/alerts-summary", "almacenero", false],
    ["/api/admin/stats", "cajero", false],
    ["/api/admin/stats", "almacenero", false],
    ["/api/admin/sse", "cajero", true],
    ["/api/admin/sse", "almacenero", false],
    ["/api/admin/platform-chat", "cajero", false],
    ["/api/admin/platform-chat", "almacenero", false],
    ["/api/ai-assistant/health", "cajero", false],
    ["/api/ai-assistant/health", "almacenero", false],
  ] as const)("%s + rol %s → %s", (ruta, rol, esperado) => {
    expect(puedePedir(ruta, rol)).toBe(esperado);
  });

  it("almacenero no puede pedir NINGUNA de las 7 rutas del panel (bug reportado 2026-09-14)", () => {
    for (const ruta of Object.keys(RUTAS_PANEL) as RutaPanel[]) {
      expect(puedePedir(ruta, "almacenero")).toBe(false);
    }
  });

  it("no hay roles inventados: todo allowedRoles es un AdminRole real", () => {
    for (const roles of Object.values(RUTAS_PANEL)) {
      for (const r of roles) {
        expect(TODOS_LOS_ROLES).toContain(r);
      }
    }
  });
});
