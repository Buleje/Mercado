/**
 * __tests__/camion-croquis.test.ts
 *
 * La parte trasera del camión (Brandon, 2026-10-03): el acomodo del croquis
 * y el orden de las columnas del cubicador. Lógica pura, sin DOM.
 */
import { describe, expect, it } from "vitest";
import {
  acomodarCroquis,
  coloresPorEspecie,
  formatoTrasera,
  PULG_POR_M,
  TOPE_CROQUIS,
} from "@/lib/forestal/camion-croquis";
import {
  desplazarColumna,
  moverColumna,
  normalizarOrden,
  segmentosDelPie,
} from "@/lib/forestal/cubicador-orden-columnas";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const P = (id: string, cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada => ({
  id, cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie,
  pieTablar: (espesor * ancho * largo * cantidad) / 12,
  m3: (espesor * ancho * largo * cantidad) / 12 / 424,
});

const LOTE = [P("t1", 5, 2, 8, 10, "Tornillo"), P("c1", 3, 2, 6, 10, "Cumala"), P("t2", 8, 2, 4, 10, "Tornillo"), P("q1", 4, 3, 3, 8, "Capirona")];

const solapan = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe("acomodarCroquis", () => {
  it("dibuja un rectángulo por pieza: Σ rectángulos = Σ cantidad", () => {
    const c = acomodarCroquis(LOTE);
    expect(c.rects).toHaveLength(5 + 3 + 8 + 4);
    expect(c.total).toBe(20);
    expect(c.sinDibujar).toBe(0);
    expect(c.noCaben).toBe(0);
  });

  it("ningún rectángulo se sale del ancho ni se pisa con otro", () => {
    const c = acomodarCroquis([...LOTE, P("x", 40, 1, 7, 8, "Moena")], { anchoM: 1.2 });
    for (const r of c.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(c.anchoPulg + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(c.altoPulg + 1e-9);
    }
    for (let i = 0; i < c.rects.length; i++)
      for (let j = i + 1; j < c.rects.length; j++) expect(solapan(c.rects[i], c.rects[j])).toBe(false);
  });

  it("la sección es espesor × ancho en pulgadas, también si la pieza vino en cm", () => {
    const enCm = { ...P("cm", 1, 5.08, 20.32, 10, "Tornillo"), uEspesor: "cm" as const, uAncho: "cm" as const };
    const [r] = acomodarCroquis([enCm]).rects;
    expect(r.h).toBeCloseTo(2, 6);
    expect(r.w).toBeCloseTo(8, 6);
  });

  it("es determinista y no depende del orden de las filas", () => {
    const a = acomodarCroquis(LOTE);
    const b = acomodarCroquis([...LOTE].reverse());
    expect(b.rects).toEqual(a.rects);
    expect(b.leyenda).toEqual(a.leyenda);
  });

  it("apila en estantes: las más gruesas abajo y el alto es la suma de los estantes", () => {
    // 2,40 m = 94,49″: las 2 de 4″ abren el estante de abajo (8″) y detrás entran 10 de 8″.
    const c = acomodarCroquis([P("a", 12, 2, 8, 10, "Tornillo"), P("b", 2, 4, 4, 10, "Cumala")]);
    const gruesas = c.rects.filter((r) => r.h === 4);
    expect(gruesas.every((r) => r.y === 0)).toBe(true);
    expect(c.altoPulg).toBe(4 + 2); // estante de 4″ (2×4″ + 10×8″) y otro de 2″ con las 2 que quedan
    expect(c.anchoPulg).toBeCloseTo(2.4 * PULG_POR_M, 6);
  });

  it("con muchas piezas dibuja hasta el tope y cuenta el resto en «+N más»", () => {
    const c = acomodarCroquis([P("m", 5000, 1, 4, 10, "Tornillo")]);
    expect(c.rects).toHaveLength(TOPE_CROQUIS);
    expect(c.total).toBe(5000);
    expect(c.sinDibujar).toBe(5000 - TOPE_CROQUIS);
    expect(c.altoPulg).toBe(Math.ceil(5000 / Math.floor((2.4 * PULG_POR_M) / 4)) * 1);
  });

  it("la pieza más ancha que el camión o sin medida no se acomoda: se cuenta aparte", () => {
    const c = acomodarCroquis([P("ancha", 2, 2, 120, 10, "Tornillo"), P("cero", 3, 0, 8, 10, "Cumala"), P("ok", 1, 2, 8, 10, "Cumala")]);
    expect(c.noCaben).toBe(5);
    expect(c.rects).toHaveLength(1);
  });

  it("la leyenda cuenta las piezas de cada especie con su color", () => {
    const c = acomodarCroquis(LOTE);
    expect(c.leyenda.map((l) => [l.especie, l.piezas])).toEqual([["Tornillo", 13], ["Capirona", 4], ["Cumala", 3]]);
    expect(new Set(c.leyenda.map((l) => l.color)).size).toBe(3);
  });
});

describe("coloresPorEspecie y formatoTrasera", () => {
  it("el color de una especie no cambia al reordenar las filas", () => {
    const a = coloresPorEspecie(LOTE);
    const b = coloresPorEspecie([...LOTE].reverse());
    expect([...b.entries()].sort()).toEqual([...a.entries()].sort());
  });

  it("con catálogo, sumar una especie a la trasera no le cambia el color a las otras", () => {
    const CAT = ["Tornillo", "Cumala", "Capirona", "Moena"];
    const antes = coloresPorEspecie([LOTE[0], LOTE[1]], CAT);
    const despues = coloresPorEspecie(LOTE, CAT);
    expect(despues.get("tornillo")).toBe(antes.get("tornillo"));
    expect(despues.get("cumala")).toBe(antes.get("cumala"));
  });

  it("hasta 4 especies, todas con color vivo (no gris), aunque estén lejos en el catálogo", () => {
    const CAT = ["A", "B", "C", "D", "E", "Tornillo", "Cumala", "Capirona"];
    const c = coloresPorEspecie(LOTE, CAT);
    expect([...c.values()].every((i) => i < 4)).toBe(true);
  });

  it("dos especies presentes nunca comparten color, aunque el catálogo pase de 8", () => {
    const CAT = Array.from({ length: 12 }, (_, i) => `Especie ${i}`);
    const c = coloresPorEspecie([{ especie: "Especie 0" }, { especie: "Especie 8" }, { especie: "Especie 9" }], CAT);
    expect(new Set(c.values()).size).toBe(3);
  });

  it("totales: piezas sumadas y m³ desde el PT total", () => {
    const f = formatoTrasera(LOTE);
    expect(f.filas.map((x) => x.n)).toEqual([1, 2, 3, 4]);
    expect(f.totales.piezas).toBe(20);
    const pt = LOTE.reduce((a, p) => a + p.pieTablar, 0);
    expect(f.totales.pt).toBeCloseTo(pt, 9);
    expect(f.totales.m3).toBeCloseTo(pt / 424, 4);
    expect(f.filas[0]).toMatchObject({ especie: "Tornillo", medida: "2×8×10", piezas: 5 });
  });
});

describe("orden de columnas", () => {
  const DEF = ["numero", "cant", "espesor", "m3", "pt"] as const;
  type K = (typeof DEF)[number];

  it("normaliza lo guardado: descarta lo desconocido y mete las nuevas en su lugar", () => {
    expect(normalizarOrden(["pt", "cant", "zzz", "cant"], DEF)).toEqual(["numero", "pt", "cant", "espesor", "m3"]);
    expect(normalizarOrden(null, DEF)).toEqual([...DEF]);
  });

  it("mueve antes de otra o al final", () => {
    expect(moverColumna<K>([...DEF], "pt", "cant")).toEqual(["numero", "pt", "cant", "espesor", "m3"]);
    expect(moverColumna<K>([...DEF], "numero", null)).toEqual(["cant", "espesor", "m3", "pt", "numero"]);
  });

  it("sube y baja saltando las que no cuentan", () => {
    expect(desplazarColumna<K>([...DEF], "m3", -1, (k) => k !== "espesor")).toEqual(["numero", "m3", "cant", "espesor", "pt"]);
    expect(desplazarColumna<K>([...DEF], "cant", 1)).toEqual(["numero", "espesor", "cant", "m3", "pt"]);
    expect(desplazarColumna<K>([...DEF], "pt", 1)).toEqual([...DEF]);
  });

  it("el pie junta las columnas sin total y rotula el primer tramo ancho", () => {
    const pie = segmentosDelPie<K>(["m3", "numero", "cant", "pt"], new Set<K>(["m3", "pt"]));
    expect(pie).toEqual([
      { tipo: "resto", span: 1, rotulo: false },
      { tipo: "total", clave: "m3" },
      { tipo: "resto", span: 2, rotulo: true },
      { tipo: "total", clave: "pt" },
      { tipo: "resto", span: 1, rotulo: false },
    ]);
  });
});
