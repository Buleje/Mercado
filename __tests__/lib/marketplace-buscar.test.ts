/**
 * Buscador del marketplace (SUPMKT-2 / SUPMKT-6):
 * - el link y la consulta hablan igual (los filtros que se dibujaban y no filtraban)
 * - con stock va en el WHERE: total y páginas cuadran
 * - «Relevancia» pone primero lo que coincide con lo buscado
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
}));

const findMany = vi.fn();
const count = vi.fn();
const storeFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    storeProduct: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
    store: { findMany: (...a: unknown[]) => storeFindMany(...a) },
  },
}));

import {
  leerParamsBuscar,
  linkBuscar,
  ordenarPorRelevancia,
  puntajeRelevancia,
} from "@/lib/marketplace/buscar-params";
import { MarketplaceSearchDB } from "@/lib/db/marketplace-search.db";

function fila(id: string, nombre: string, rating = 0, stock: number | null = 5) {
  return {
    id,
    retailPrice: "10.00",
    product: {
      id: Number(id.replace(/\D/g, "")) || 1,
      name: nombre,
      image: null,
      category: "Abarrotes",
      unit: "und",
      stock,
    },
    store: { id: "s1", slug: "bodega", name: "Bodega", zone: "Centro", rating },
  };
}

describe("link del buscador", () => {
  it("lee los 4 filtros nuevos y vuelve a escribir el mismo link", () => {
    const p = leerParamsBuscar({
      q: "arroz",
      stock: "1",
      rating: "4",
      zone: "Centro",
      cat: ["A", "B"],
    });
    expect(p).toMatchObject({
      q: "arroz",
      availability: "inStock",
      minRating: 4,
      zone: "Centro",
      categories: ["A", "B"],
    });
    expect(leerParamsBuscar(Object.fromEntries(new URLSearchParams(linkBuscar(p))))).toMatchObject({
      q: "arroz",
      availability: "inStock",
      minRating: 4,
      zone: "Centro",
    });
    expect(linkBuscar(p)).toBe("q=arroz&cat=A&cat=B&stock=1&rating=4&zone=Centro");
  });

  it("un valor roto se ignora y no revienta (page=abc antes daba offset NaN)", () => {
    const p = leerParamsBuscar({
      q: "arroz",
      page: "abc",
      sort: "hack",
      rating: "9",
      min: "x",
      stock: "si",
    });
    expect(p).toMatchObject({
      page: 1,
      sort: "relevance",
      minRating: 0,
      priceMin: null,
      availability: "all",
    });
  });

  it("pasar de página conserva filtros y orden (Siguiente borraba todo menos q)", () => {
    const p = leerParamsBuscar({
      q: "arroz",
      stock: "1",
      rating: "4",
      zone: "Centro",
      cat: "Abarrotes",
      store: "s1",
      min: "2",
      max: "50",
      sort: "price_asc",
    });
    const link = new URLSearchParams(linkBuscar({ ...p, page: 2 }));
    expect(Object.fromEntries(link)).toEqual({
      q: "arroz",
      sort: "price_asc",
      page: "2",
      cat: "Abarrotes",
      store: "s1",
      min: "2",
      max: "50",
      stock: "1",
      rating: "4",
      zone: "Centro",
    });
    expect(leerParamsBuscar(Object.fromEntries(link))).toEqual({ ...p, page: 2 });
  });

  it("stock=0 = agotados; min vacío no es 0", () => {
    expect(leerParamsBuscar({ stock: "0", min: "" })).toMatchObject({
      availability: "outOfStock",
      priceMin: null,
    });
  });
});

describe("relevancia", () => {
  it("empieza > palabra que empieza > contiene > sólo categoría, sin importar tildes", () => {
    expect(puntajeRelevancia("Arroz Costeño 5kg", "arroz")).toBe(0);
    expect(puntajeRelevancia("Porción de Árroz Chaufa", "arroz")).toBe(1);
    expect(puntajeRelevancia("Superarroz", "arroz")).toBe(2);
    expect(puntajeRelevancia("Fideos", "arroz")).toBe(3);
  });

  it("las estrellas sólo desempatan", () => {
    const filas = [
      { n: "Galletas con arroz inflado", r: 5 },
      { n: "Arroz Costeño 5kg", r: 0 },
      { n: "Mazamorra", r: 4 },
      { n: "Arroz Faraón", r: 3 },
    ];
    const orden = ordenarPorRelevancia(filas, "arroz", (f) => ({ nombre: f.n, rating: f.r })).map(
      (f) => f.n,
    );
    expect(orden).toEqual([
      "Arroz Faraón",
      "Arroz Costeño 5kg",
      "Galletas con arroz inflado",
      "Mazamorra",
    ]);
  });
});

describe("MarketplaceSearchDB.search", () => {
  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    storeFindMany.mockReset().mockResolvedValue([{ zone: "Centro" }]);
  });

  it("«con stock» va en el WHERE (cuenta y página usan el mismo filtro) y respeta q + categoría", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    await MarketplaceSearchDB.search({
      q: "arroz",
      categories: ["Abarrotes"],
      availability: "inStock",
      minRating: 4,
      zone: "Centro",
      sort: "price_asc",
    });
    const where = count.mock.calls[0][0].where;
    expect(where.product.AND).toEqual([
      {
        OR: [
          { name: { contains: "arroz", mode: "insensitive" } },
          { category: { contains: "arroz", mode: "insensitive" } },
        ],
      },
      { OR: [{ category: { contains: "Abarrotes", mode: "insensitive" } }] },
      { OR: [{ stock: null }, { stock: { gt: 0 } }] },
    ]);
    expect(where.store).toEqual({ isPublished: true, zone: "Centro", rating: { gte: 4 } });
    // la página paginada usa exactamente el mismo where que el total
    expect(findMany.mock.calls[0][0].where).toBe(where);
  });

  it("agotados = stock ≤ 0 (null = se hace al pedido, no es agotado)", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    await MarketplaceSearchDB.search({ q: "pizza", availability: "outOfStock", sort: "newest" });
    expect(count.mock.calls[0][0].where.product.AND[1]).toEqual({ stock: { lte: 0 } });
  });

  it("«Relevancia» con texto ordena la muestra y corta la página en memoria", async () => {
    const muestra = [
      fila("sp1", "Galletas con arroz inflado", 5),
      fila("sp2", "Porción de Arroz Chaufa", 0),
      fila("sp3", "Arroz Costeño Extra 5kg", 0),
    ];
    findMany.mockResolvedValue(muestra);
    count.mockResolvedValue(3);
    const r = await MarketplaceSearchDB.search({ q: "arroz", limit: 2, offset: 0 });
    expect(r.products.map((p) => p.name)).toEqual([
      "Arroz Costeño Extra 5kg",
      "Galletas con arroz inflado",
    ]);
    // sin consulta paginada aparte: una sola findMany (la muestra)
    expect(findMany).toHaveBeenCalledTimes(1);
    const p2 = await MarketplaceSearchDB.search({ q: "arroz", limit: 2, offset: 2 });
    expect(p2.products.map((p) => p.name)).toEqual(["Porción de Arroz Chaufa"]);
    expect(r.zonesFacet).toEqual(["Centro"]);
    expect(r.storesFacet[0]).toMatchObject({ id: "s1", count: 3, rating: 5 });
  });
});
