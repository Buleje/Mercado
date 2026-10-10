/**
 * ADR-460 · los filtros del catálogo del salón (`extensiones/pagina-bodega-buleje-test/filtros.ts`).
 * · Cada parámetro de la URL pasa su `safeParse`: el inválido vuelve a su
 *   defecto sin tocar a los demás.
 * · Sólo categorías y marcas del salón (la bodega de prueba vive en el mismo negocio).
 * · Buscar sin tildes, «queratina» = «keratina», plurales simples.
 * · Las píldoras cuentan con los DEMÁS filtros puestos.
 */
import { describe, expect, it } from "vitest";
import {
  aParametros,
  aplicar,
  coincide,
  contar,
  cuantosAjustes,
  leerFiltros,
  SIN_FILTROS,
  type Filtrable,
} from "@/extensiones/pagina-bodega-buleje-test/filtros";

const CATS = ["Shampoo", "Coloración", "Herramientas"];
const MARCAS = ["Buleje Pro", "Selva Botánica"];

const p = (id: number, x: Partial<Filtrable>): Filtrable => ({
  id,
  nombre: `Producto ${id}`,
  marca: null,
  categoria: "Shampoo",
  descripcion: null,
  precio: 10,
  descuento: null,
  stock: 10,
  etiqueta: null,
  ...x,
});

const PRODUCTOS = [
  p(1, { nombre: "Shampoo Reparación Intensa", marca: "Buleje Pro", precio: 43.9, descuento: 20, descripcion: "Con queratina vegetal." }),
  p(2, { nombre: "Shampoo Sacha Inchi", marca: "Selva Botánica", precio: 42.9, etiqueta: "Favorito" }),
  p(3, { nombre: "Plancha de Titanio Pro", categoria: "Herramientas", marca: "Buleje Pro", precio: 289, stock: 0 }),
  p(4, { nombre: "Tinte Castaño", categoria: "Coloración", precio: 32.9, descuento: 30, stock: null }),
];

describe("leerFiltros", () => {
  it("lee los seis parámetros válidos", () => {
    expect(
      leerFiltros({ q: " keratina ", categoria: "Shampoo", oferta: "1", orden: "precio-asc", marca: "Buleje Pro", disponibles: "1" }, CATS, MARCAS),
    ).toEqual({ q: "keratina", categoria: "Shampoo", oferta: true, orden: "precio-asc", marca: "Buleje Pro", disponibles: true });
  });

  it("vacío → sin filtros", () => {
    expect(leerFiltros({}, CATS, MARCAS)).toEqual(SIN_FILTROS);
  });

  it("un parámetro inválido vuelve a su defecto sin tocar a los demás", () => {
    const f = leerFiltros({ orden: "barato", oferta: "si", disponibles: "true", categoria: "Shampoo", q: "x".repeat(81) }, CATS, MARCAS);
    expect(f).toEqual({ ...SIN_FILTROS, categoria: "Shampoo" });
  });

  it("una categoría que no es del salón (la bodega) se ignora; sin tildes ni mayúsculas se reconoce", () => {
    expect(leerFiltros({ categoria: "Abarrotes" }, CATS, MARCAS).categoria).toBeNull();
    expect(leerFiltros({ categoria: "coloracion" }, CATS, MARCAS).categoria).toBe("Coloración");
    expect(leerFiltros({ marca: "selva botanica" }, CATS, MARCAS).marca).toBe("Selva Botánica");
    expect(leerFiltros({ marca: "Otra" }, CATS, MARCAS).marca).toBeNull();
  });

  it("un parámetro repetido toma el primero", () => {
    expect(leerFiltros({ categoria: ["Herramientas", "Shampoo"] }, CATS, MARCAS).categoria).toBe("Herramientas");
  });
});

describe("aParametros", () => {
  it("omite lo que está en su defecto y sale en orden fijo", () => {
    expect(aParametros(SIN_FILTROS)).toEqual([]);
    expect(aParametros({ ...SIN_FILTROS, disponibles: true, q: "rizos", orden: "nuevos" })).toEqual([
      ["q", "rizos"],
      ["orden", "nuevos"],
      ["disponibles", "1"],
    ]);
  });

  it("ida y vuelta: lo escrito se vuelve a leer igual", () => {
    const f = { q: "aceite", categoria: "Coloración", oferta: true, orden: "descuento" as const, marca: "Buleje Pro", disponibles: true };
    expect(leerFiltros(Object.fromEntries(aParametros(f)), CATS, MARCAS)).toEqual(f);
  });
});

describe("coincide", () => {
  it("«keratina» encuentra «queratina» en la descripción; sin tildes; todas las palabras", () => {
    expect(coincide(PRODUCTOS[0], "keratina")).toBe(true);
    expect(coincide(PRODUCTOS[0], "REPARACION")).toBe(true);
    expect(coincide(PRODUCTOS[0], "reparación plancha")).toBe(false);
    expect(coincide(PRODUCTOS[1], "selva botánica")).toBe(true);
  });

  it("plural simple: «planchas» encuentra «Plancha»", () => {
    expect(coincide(PRODUCTOS[2], "planchas")).toBe(true);
  });
});

describe("aplicar y contar", () => {
  it("destacados: favoritos, luego con descuento, luego lo más nuevo", () => {
    expect(aplicar(PRODUCTOS, SIN_FILTROS).map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });

  it("ordena por precio y por descuento", () => {
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, orden: "precio-asc" }).map((x) => x.id)).toEqual([4, 2, 1, 3]);
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, orden: "precio-desc" }).map((x) => x.id)).toEqual([3, 1, 2, 4]);
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, orden: "descuento" }).map((x) => x.id)).toEqual([4, 1, 2, 3]);
  });

  it("disponibles deja afuera el stock 0 pero no el stock desconocido", () => {
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, disponibles: true }).map((x) => x.id).sort()).toEqual([1, 2, 4]);
  });

  it("las píldoras cuentan con los demás filtros (no con la categoría)", () => {
    const c = contar(PRODUCTOS, { ...SIN_FILTROS, categoria: "Shampoo", oferta: true });
    expect(c.todos).toBe(2); // con oferta, todas las categorías: 1 y 4
    expect(c.porCategoria.get("Shampoo")).toBe(1);
    expect(c.porCategoria.get("Coloración")).toBe(1);
    expect(c.ofertas).toBe(1); // ofertas DENTRO de Shampoo
  });

  it("el número del botón «Filtrar y ordenar» cuenta los ajustes de la hoja", () => {
    expect(cuantosAjustes(SIN_FILTROS)).toBe(0);
    expect(cuantosAjustes({ ...SIN_FILTROS, q: "x", categoria: "Shampoo", orden: "nuevos", oferta: true })).toBe(2);
  });
});
