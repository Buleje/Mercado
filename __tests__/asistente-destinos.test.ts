/**
 * El asistente resolviendo "llevame a…".
 *
 * Antes el chat terminaba con «andá al módulo "inventario-almacenes"» — un
 * nombre interno que el dueño de la bodega no conoce y que además no siempre
 * existe. Estos casos fijan que un destino inventado NO se resuelve: es
 * preferible que el asistente diga que no sabe a que ofrezca un botón que abre
 * una pantalla en blanco.
 */
import { describe, expect, it } from "vitest";
import {
  DESTINOS_ADMIN,
  resolverDestino,
  urlDeDestino,
} from "@/lib/agents/domains/ui.agent";

describe("resolverDestino", () => {
  it("resuelve por clave exacta", () => {
    expect(resolverDestino("kardex")?.vista).toBe("kardex");
    expect(resolverDestino("ctp-ficha")?.tab).toBe("ctp-libro-operaciones");
  });

  it("resuelve por el nombre que ve el usuario, con o sin tildes", () => {
    expect(resolverDestino("Cuentas pendientes")?.tab).toBe("fiados");
    expect(resolverDestino("cuentas pendientes")?.tab).toBe("fiados");
  });

  it("tolera que el modelo pida algo parecido", () => {
    expect(resolverDestino("libro ctp")?.tab).toBe("ctp-libro-operaciones");
    expect(resolverDestino("historial-gastos")?.vista).toBe("historial-gastos");
  });

  it("un destino inventado NO se resuelve (mejor sin botón que con uno roto)", () => {
    // Los dos que el modelo inventó de verdad en las pruebas del 2026-08-12.
    expect(resolverDestino("precios-promos")).toBeNull();
    expect(resolverDestino("panel-magico")).toBeNull();
    expect(resolverDestino("")).toBeNull();
  });

  it("no matchea por pedazos de palabra: 'pos' no puede salir de cualquier cosa", () => {
    expect(resolverDestino("p")).toBeNull();
    expect(resolverDestino("pro")).toBeNull();
  });

  it("si el modelo agrega palabras de más, igual encuentra la pantalla", () => {
    expect(resolverDestino("inventario almacenes v2")?.tab).toBe("inventario");
  });
});

describe("urlDeDestino", () => {
  it("arma la URL del panel con tab, vista y ancla", () => {
    const kardex = resolverDestino("kardex")!;
    expect(urlDeDestino(kardex)).toBe("/admin?tab=inventario&vista=kardex#inventario");
  });

  it("sin sub-vista no inventa el parámetro", () => {
    const clientes = resolverDestino("clientes")!;
    expect(urlDeDestino(clientes)).toBe("/admin?tab=clientes#clientes");
  });

  it("el filtro viaja como búsqueda", () => {
    const productos = resolverDestino("productos")!;
    expect(urlDeDestino(productos, "arroz")).toContain("q=arroz");
  });
});

describe("catálogo de destinos", () => {
  it("no hay claves repetidas: una clave ambigua elegiría cualquiera", () => {
    const claves = DESTINOS_ADMIN.map((d) => d.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada destino dice para qué sirve — es como el modelo elige", () => {
    for (const d of DESTINOS_ADMIN) {
      expect(d.para.length).toBeGreaterThan(10);
      expect(d.label.length).toBeGreaterThan(2);
      expect(d.tab).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
