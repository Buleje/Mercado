import { describe, it, expect } from "vitest";
import {
  armarMadera,
  categoriasDeFilas,
  claveDeNombre,
  elegirVentana,
  m3De,
  nombreVisible,
  zonasDeFilas,
  type FilaDemandaTienda,
  type FilaMadera,
} from "@/lib/intelligence/demanda-plataforma";

const tienda = (p: Partial<FilaDemandaTienda>): FilaDemandaTienda => ({
  tenantId: "t1",
  category: "Bebidas",
  u30: 0,
  p30: 0,
  u90: 0,
  p90: 0,
  ...p,
});

const madera = (p: Partial<FilaMadera>): FilaMadera => ({
  tenantId: "blas",
  flujo: "produccion",
  especie: "Tornillo",
  unidad: "m3",
  actual: 0,
  previo: 0,
  ...p,
});

describe("nombres", () => {
  it("la clave junta mayúsculas, espacios y tildes", () => {
    expect(claveDeNombre("TORNILLO")).toBe("tornillo");
    expect(claveDeNombre("  Tornillo  ")).toBe("tornillo");
    expect(claveDeNombre("Panadería")).toBe(claveDeNombre("panaderia"));
    expect(claveDeNombre(null)).toBe("");
    expect(claveDeNombre("   ")).toBe("");
  });

  it("el nombre visible empieza en mayúscula y usa el valor por defecto si viene vacío", () => {
    expect(nombreVisible("CACHIMBO")).toBe("Cachimbo");
    expect(nombreVisible("  copaiba  ")).toBe("Copaiba");
    expect(nombreVisible(null)).toBe("Sin especie");
    expect(nombreVisible("", "")).toBe("");
  });
});

describe("elegirVentana", () => {
  it("con 20 unidades o más en 30 días mira 30", () => {
    expect(elegirVentana([tienda({ u30: 12 }), tienda({ tenantId: "t2", u30: 8 })]).days).toBe(30);
  });

  it("con 19 mira 90 (la tendencia de 30 días sería ruido)", () => {
    const v = elegirVentana([tienda({ u30: 19, u90: 60 })]);
    expect(v.days).toBe(90);
    expect(v.label).toBe("Últimos 90 días");
  });

  it("sin filas también cae a 90", () => {
    expect(elegirVentana([]).days).toBe(90);
  });
});

describe("categoriasDeFilas", () => {
  const filas = [
    tienda({ tenantId: "a", category: "Bebidas", u30: 10, p30: 4, u90: 30, p90: 20 }),
    tienda({ tenantId: "b", category: "bebidas", u30: 5, p30: 6, u90: 15, p90: 10 }),
    tienda({ tenantId: "a", category: "Abarrotes", u30: 0, p30: 0, u90: 0, p90: 0 }),
    tienda({ tenantId: "a", category: "Lácteos", u30: 0, p30: 3, u90: 0, p90: 9 }),
  ];

  it("suma los negocios y junta categorías escritas distinto", () => {
    const r = categoriasDeFilas(filas, { days: 30, label: "x" });
    expect(r.find((c) => c.category === "Bebidas")).toEqual({ category: "Bebidas", units: 15, prevUnits: 10 });
  });

  it("deja afuera la categoría sin nada ni antes ni ahora, pero conserva la que cayó a cero", () => {
    const r = categoriasDeFilas(filas, { days: 30, label: "x" });
    expect(r.map((c) => c.category).sort()).toEqual(["Bebidas", "Lácteos"]);
  });

  it("usa las columnas de 90 días cuando la ventana es de 90", () => {
    const r = categoriasDeFilas(filas, { days: 90, label: "x" });
    expect(r.find((c) => c.category === "Bebidas")).toEqual({ category: "Bebidas", units: 45, prevUnits: 30 });
  });

  it("ignora categorías vacías", () => {
    expect(categoriasDeFilas([tienda({ category: "  ", u30: 5 })], { days: 30, label: "x" })).toEqual([]);
  });
});

describe("zonasDeFilas", () => {
  const v = { days: 30 as const, label: "x" };

  it("suma por la zona de cada negocio y salta a los que no tienen zona", () => {
    const filas = [
      tienda({ tenantId: "a", category: "Bebidas", u30: 10 }),
      tienda({ tenantId: "a", category: "Abarrotes", u30: 4 }),
      tienda({ tenantId: "b", category: "Bebidas", u30: 6 }),
      tienda({ tenantId: "sin-zona", u30: 99 }),
    ];
    const zonas = zonasDeFilas(filas, v, new Map([["a", "Centro"], ["b", "Centro"]]), new Map());
    expect(zonas).toHaveLength(1);
    expect(zonas[0].zone).toBe("Centro");
    expect(zonas[0].units).toBe(20);
    expect(zonas[0].categoryUnits.find((c) => c.category === "Bebidas")?.units).toBe(16);
  });

  it("no lista una zona que no vendió nada en la ventana", () => {
    const filas = [tienda({ tenantId: "a", u30: 0, p30: 7 })];
    expect(zonasDeFilas(filas, v, new Map([["a", "Centro"]]), new Map())).toEqual([]);
  });

  it("suma los quiebres de todos los negocios de la zona", () => {
    const filas = [tienda({ tenantId: "a", u30: 3 })];
    const zonas = zonasDeFilas(
      filas,
      v,
      new Map([["a", "Centro"], ["b", "Centro"], ["c", "Norte"]]),
      new Map([["a", 2], ["b", 1], ["c", 5]]),
    );
    expect(zonas[0].stockouts).toBe(3);
  });
});

describe("m3De", () => {
  it("m3 y m³ pasan tal cual", () => {
    expect(m3De(2.5, "m3")).toBe(2.5);
    expect(m3De(2.5, "M³")).toBe(2.5);
  });

  it("pies tablares se dividen entre 424", () => {
    expect(m3De(424, "pt")).toBe(1);
    expect(m3De(212, " PT ")).toBeCloseTo(0.5, 10);
  });

  it("lo que no es volumen no suma", () => {
    expect(m3De(100, "kg")).toBe(0);
    expect(m3De(100, null)).toBe(0);
    expect(m3De(100, "")).toBe(0);
  });

  it("cantidades negativas, cero o no finitas dan 0", () => {
    expect(m3De(-3, "m3")).toBe(0);
    expect(m3De(0, "m3")).toBe(0);
    expect(m3De(Number.NaN, "m3")).toBe(0);
    expect(m3De(Number.POSITIVE_INFINITY, "m3")).toBe(0);
  });
});

describe("armarMadera", () => {
  it("junta TORNILLO y Tornillo en una sola especie y suma los flujos", () => {
    const r = armarMadera(
      [
        madera({ especie: "TORNILLO", flujo: "produccion", actual: 10, previo: 5 }),
        madera({ especie: "Tornillo", flujo: "despacho", actual: 4, previo: 0 }),
        madera({ especie: "tornillo ", flujo: "ingreso", actual: 6, previo: 5 }),
      ],
      90,
      "Últimos 90 días",
    );
    expect(r.species).toHaveLength(1);
    const t = r.species[0];
    expect(t.species).toBe("Tornillo");
    expect(t.m3).toBe(20);
    expect(t.prevM3).toBe(10);
    expect(t.trendPct).toBe(100);
    expect(t.produccionM3).toBe(10);
    expect(t.despachoM3).toBe(4);
    expect(t.ingresoM3).toBe(6);
    expect(r.totalM3).toBe(20);
  });

  it("convierte pies tablares y descarta lo que no es volumen", () => {
    const r = armarMadera(
      [
        madera({ especie: "Cachimbo", unidad: "pt", actual: 848 }),
        madera({ especie: "Cachimbo", unidad: "kg", actual: 5000 }),
      ],
      90,
      "x",
    );
    expect(r.species[0].m3).toBe(2);
  });

  it("si antes había y ahora no, la especie sigue y cae -100", () => {
    const r = armarMadera([madera({ especie: "Cachimbo", actual: 0, previo: 13.673 })], 90, "x");
    expect(r.species[0]).toMatchObject({ species: "Cachimbo", m3: 0, prevM3: 13.673, trendPct: -100 });
  });

  it("si antes no había nada, la tendencia es +100 y no infinito", () => {
    const r = armarMadera([madera({ especie: "Copaiba", actual: 3, previo: 0 })], 90, "x");
    expect(r.species[0].trendPct).toBe(100);
  });

  it("deja afuera la fila 0/0 y no cuenta el aserradero que no movió nada", () => {
    const r = armarMadera(
      [
        madera({ tenantId: "blas", especie: "Tornillo", actual: 5 }),
        madera({ tenantId: "otro", especie: "Tornillo", actual: 0, previo: 0 }),
        madera({ tenantId: "otro", especie: "Quinilla", actual: 0, previo: 0 }),
      ],
      90,
      "x",
    );
    expect(r.species.map((e) => e.species)).toEqual(["Tornillo"]);
    expect(r.species[0].negocios).toBe(1);
    expect(r.negocios).toBe(1);
  });

  it("cuenta los aserraderos distintos que movieron la especie", () => {
    const r = armarMadera(
      [
        madera({ tenantId: "a", especie: "Tornillo", actual: 1 }),
        madera({ tenantId: "b", especie: "Tornillo", actual: 2, flujo: "despacho" }),
        madera({ tenantId: "a", especie: "Tornillo", actual: 3, flujo: "ingreso" }),
      ],
      90,
      "x",
    );
    expect(r.species[0].negocios).toBe(2);
    expect(r.negocios).toBe(2);
  });

  it("ordena de más a menos m³ y agrupa sin especie", () => {
    const r = armarMadera(
      [
        madera({ especie: "Cachimbo", actual: 2 }),
        madera({ especie: null, actual: 7 }),
        madera({ especie: "Tornillo", actual: 4 }),
      ],
      90,
      "x",
    );
    expect(r.species.map((e) => e.species)).toEqual(["Sin especie", "Tornillo", "Cachimbo"]);
  });

  it("redondea a 3 decimales y arrastra días y rótulo", () => {
    const r = armarMadera([madera({ actual: 1 / 3 })], 90, "Últimos 90 días");
    expect(r.species[0].m3).toBe(0.333);
    expect(r.days).toBe(90);
    expect(r.label).toBe("Últimos 90 días");
  });

  it("sin filas devuelve un reporte vacío", () => {
    expect(armarMadera([], 90, "x")).toEqual({ days: 90, label: "x", totalM3: 0, negocios: 0, species: [] });
  });
});
