/**
 * Tienda Musa (`extensiones/pagina-musa/filtros.ts`).
 * · La grilla sigue el orden del catálogo impreso: MU001…MU020, kits KT01…KT05,
 *   dúos (MU013-2) y al final lo que no tiene código.
 * · Un favorito o una rebaja suben antes que el orden del catálogo.
 * · Se busca también por el código que Drucila manda por WhatsApp («mu013»).
 */
import { describe, expect, it } from "vitest";
import { aplicar, coincide, ordenCatalogo, SIN_FILTROS, type Filtrable } from "@/extensiones/pagina-musa/filtros";

const p = (id: number, codigo: string | null, x: Partial<Filtrable> = {}): Filtrable => ({
  id,
  nombre: `Producto ${id}`,
  marca: null,
  categoria: "Cabello",
  descripcion: null,
  precio: 59,
  descuento: null,
  stock: null,
  etiqueta: "Preventa",
  codigo,
  ...x,
});

describe("ordenCatalogo", () => {
  it("productos, kits, dúos y sin código, en ese orden", () => {
    const codigos = ["MU013-2", "KT01", "MU020", "MU001", null];
    const ordenados = [...codigos].sort((a, b) => ordenCatalogo(a) - ordenCatalogo(b));
    expect(ordenados).toEqual(["MU001", "MU020", "KT01", "MU013-2", null]);
  });

  it("no distingue mayúsculas y los kits van por número", () => {
    expect(ordenCatalogo("mu005")).toBe(ordenCatalogo("MU005"));
    expect(ordenCatalogo("KT02")).toBeLessThan(ordenCatalogo("KT05"));
    expect(ordenCatalogo("MU020")).toBeLessThan(ordenCatalogo("KT01"));
  });
});

describe("aplicar con «destacados»", () => {
  it("sin favoritos ni rebajas, la grilla sale en el orden del catálogo", () => {
    const productos = [p(1, "MU013-2"), p(2, "KT01"), p(3, "MU020"), p(4, "MU001"), p(5, null)];
    expect(aplicar(productos, SIN_FILTROS).map((x) => x.codigo)).toEqual(["MU001", "MU020", "KT01", "MU013-2", null]);
  });

  it("un favorito o una rebaja suben antes que el orden del catálogo", () => {
    const productos = [p(1, "MU001"), p(2, "KT03", { etiqueta: "Favorito" }), p(3, "MU002", { descuento: 10 })];
    expect(aplicar(productos, SIN_FILTROS).map((x) => x.codigo)).toEqual(["KT03", "MU002", "MU001"]);
  });
});

describe("coincide", () => {
  it("encuentra por el código del catálogo, sin importar mayúsculas", () => {
    expect(coincide(p(1, "MU013"), "mu013")).toBe(true);
    expect(coincide(p(2, "KT04"), "kt04")).toBe(true);
    expect(coincide(p(3, "MU001"), "mu013")).toBe(false);
  });
});
