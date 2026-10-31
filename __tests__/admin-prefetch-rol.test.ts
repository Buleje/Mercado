/**
 * Tests — la precarga del panel (2026-09-14, recortada 16-10).
 * 09-14: el almacenero recibía 403 de /api/customers y /api/sales en cada carga
 * porque useAdminPrefetch los pedía para cualquier rol.
 * 16-10: esos dos, /api/admin/dashboard y /api/goals se guardaban en claves de
 * localStorage que nadie leía → fuera. Sólo queda lo que lee el Punto de compra.
 */
import { describe, it, expect } from "vitest";
import { objetivosParaRol } from "@/hooks/use-admin-prefetch";

const urls = (rol: Parameters<typeof objetivosParaRol>[0]) => objetivosParaRol(rol).map((t) => t.url);

describe("precarga del panel", () => {
  it("sólo precarga lo que el Punto de compra lee (productos y proveedores)", () => {
    expect(urls("admin")).toEqual(["/api/products", "/api/suppliers"]);
  });

  it("ningún rol precarga clientes, ventas, dashboard ni metas (nadie los leía)", () => {
    for (const rol of ["admin", "cajero", "almacenero", null] as const) {
      expect(urls(rol)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/customers|sales|dashboard|goals/)]),
      );
    }
  });

  it("el almacenero precarga productos", () => {
    expect(urls("almacenero")).toContain("/api/products");
  });
});
