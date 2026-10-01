/**
 * Tests — la precarga del panel respeta el rol (2026-09-14).
 * Medido en navegador: el almacenero recibía 403 de /api/customers y /api/sales
 * en cada carga porque useAdminPrefetch los pedía para cualquier rol.
 */
import { describe, it, expect } from "vitest";
import { objetivosParaRol } from "@/hooks/use-admin-prefetch";

const urls = (rol: Parameters<typeof objetivosParaRol>[0]) => objetivosParaRol(rol).map((t) => t.url);

describe("precarga del panel según el rol", () => {
  it("el almacenero no precarga clientes ni ventas, sí productos", () => {
    expect(urls("almacenero")).not.toContain("/api/customers");
    expect(urls("almacenero")).not.toContain("/api/sales?limit=200");
    expect(urls("almacenero")).toContain("/api/products");
  });

  it("el admin precarga clientes y ventas", () => {
    expect(urls("admin")).toEqual(expect.arrayContaining(["/api/customers", "/api/sales?limit=200"]));
  });

  it("el cajero precarga ventas pero no clientes", () => {
    expect(urls("cajero")).toContain("/api/sales?limit=200");
    expect(urls("cajero")).not.toContain("/api/customers");
  });

  it("sin rol resuelto no precarga nada con roles acotados", () => {
    expect(urls(null)).not.toContain("/api/customers");
    expect(urls(null)).not.toContain("/api/sales?limit=200");
  });
});
