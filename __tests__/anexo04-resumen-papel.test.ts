/**
 * El «Resumen del papel» del ANEXO N° 04: cada hoja suma su total impreso, el
 * general suma el total del anexo, en m³ y en PT, con el anexo armado por el
 * mismo `construirAnexo04` que dibuja la hoja.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04, type DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { resumenDelPapel } from "@/lib/forestal/anexo04-resumen-papel";
import { sumaExacta } from "@/lib/forestal/gtf-redondeo";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie: string, tipo?: TipoComercial): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `r${++seq}`, ...dims, especie, ...(tipo ? { tipo } : {}), ...cubicarPieza(dims) };
}

/** 3 especies × varios tipos → más de 4 bloques (varias hojas); Tornillo con 40 medidas → se parte en 2 bloques. */
function lote(): PiezaCubicada[] {
  const out: PiezaCubicada[] = [];
  for (let i = 0; i < 40; i++) out.push(pieza(3 + (i % 4), 1 + (i % 3), 4 + (i % 5), 7 + (i % 6), "Tornillo", "Tablas" as TipoComercial));
  out.push(pieza(5, 2, 8, 10, "Tornillo", "Listones" as TipoComercial));
  out.push(pieza(7, 2, 6, 10, "Cumala", "Tablas" as TipoComercial));
  out.push(pieza(9, 3, 7, 11, "Cumala", "Listones" as TipoComercial));
  out.push(pieza(4, 2, 5, 9, "Cumala", "Tablas" as TipoComercial));
  out.push(pieza(6, 2, 4, 12, "Lupuna", "Tablas" as TipoComercial));
  out.push(pieza(2, 1, 9, 13, "Lupuna", "Listones" as TipoComercial));
  return out;
}

const datos = (unidadV: "pt" | "m3"): Pick<DatosAnexo04, "unidadV" | "modo"> => ({ unidadV, modo: "compacto" });

describe.each(["pt", "m3"] as const)("resumenDelPapel · anexo en %s", (u) => {
  const rows = lote();
  const anexo = construirAnexo04(rows, datos(u));
  const r = resumenDelPapel(anexo, rows);

  it("hay varias hojas y una especie partida entre bloques", () => {
    expect(anexo.hojas.length).toBeGreaterThan(1);
    expect(anexo.hojas.flatMap((h) => h.bloques).some((b) => b.continuacion)).toBe(true);
  });

  it("cada hoja suma su total impreso (milésimos exactos)", () => {
    for (const h of r.hojas) {
      const aMano = sumaExacta(h.filas.map((f) => f.m3)).toDecimalPlaces(3).toNumber();
      expect(aMano).toBe(anexo.hojas[h.numero - 1].totalM3);
      expect(h.suma.m3).toBe(h.totalImpresoM3);
    }
  });

  it("el general suma el total del anexo, las piezas y los renglones", () => {
    expect(r.general.total.m3).toBe(anexo.totalCalculadoM3);
    expect(r.general.total.piezas).toBe(anexo.totalPiezas);
    expect(r.general.total.reg).toBe(anexo.hojas.flatMap((h) => h.bloques).reduce((a, b) => a + b.filas.length, 0));
    expect(sumaExacta(r.hojas.map((h) => h.totalImpresoM3)).toNumber()).toBe(anexo.totalM3);
  });

  it("todos los controles cuadran y una fila sale por tipo × especie", () => {
    expect(r.controles.every((c) => c.cuadra)).toBe(true);
    expect(r.cuadra).toBe(true);
    const claves = r.general.filas.map((f) => `${f.tipo}|${f.especie}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("el PT del general es la suma de sus filas ya redondeadas", () => {
    const suma = sumaExacta(r.general.filas.map((f) => f.pt as number)).toDecimalPlaces(r.decimalesPt).toNumber();
    expect(r.general.total.pt).toBe(suma);
    expect(r.hojas.reduce((a, h) => a + (h.suma.pt ?? 0), 0)).toBeCloseTo(suma, 6);
  });
});

describe("PT según la unidad del anexo", () => {
  const rows = lote();
  it("en pt es lo impreso (Σ de subtotales) y no se declara derivado", () => {
    const a = construirAnexo04(rows, datos("pt"));
    const r = resumenDelPapel(a);
    expect(r.ptDerivado).toBe(false);
    const impreso = sumaExacta(a.hojas.flatMap((h) => h.bloques).map((b) => b.subtotal)).toDecimalPlaces(3).toNumber();
    expect(r.general.total.pt).toBe(impreso);
  });
  it("en m³ sale de las piezas, a 2 decimales por fila, y se declara derivado", () => {
    const r = resumenDelPapel(construirAnexo04(rows, datos("m3")), rows);
    expect(r.ptDerivado).toBe(true);
    for (const f of r.general.filas) expect(Math.round((f.pt as number) * 100) / 100).toBe(f.pt);
  });
  it("en m³ sin las piezas el PT queda en null (no se inventa)", () => {
    const r = resumenDelPapel(construirAnexo04(rows, datos("m3")));
    expect(r.general.total.pt).toBeNull();
  });
});

describe("control de cuadre", () => {
  it("con un total declarado a mano, las hojas cuadran contra él y se avisa la diferencia con lo calculado", () => {
    const rows = lote();
    const base = construirAnexo04(rows, datos("m3"));
    const a = construirAnexo04(rows, datos("m3"), { totalManualM3: base.totalCalculadoM3 + 0.005 });
    const r = resumenDelPapel(a, rows);
    const manual = r.controles.find((c) => c.texto.startsWith("Total declarado a mano"));
    expect(manual).toBeDefined();
    expect(manual!.cuadra).toBe(false);
    expect(manual!.diferencia).toBe(0.005);
    expect(r.cuadra).toBe(false);
  });
  it("un anexo sin piezas no revienta", () => {
    const r = resumenDelPapel(construirAnexo04([], datos("pt")));
    expect(r.general.filas).toEqual([]);
    expect(r.general.total.m3).toBe(0);
  });
});

describe("detalle por columna y subtotal por especie × tipo (Brandon 2026-10-03)", () => {
  it("una especie × tipo en dos columnas: cada columna aparte y su subtotal suma m³, PT y piezas", () => {
    for (const u of ["pt", "m3"] as const) {
      const rows = lote();
      const r = resumenDelPapel(construirAnexo04(rows, datos(u)), rows);
      const partida = r.hojas.flatMap((h) => h.grupos).find((g) => g.columnas.length > 1);
      expect(partida, u).toBeDefined();
      const g = partida!;
      const r3 = (vs: number[]) => Math.round(vs.reduce((a, v) => a + Math.round(v * 1000), 0)) / 1000;
      expect(g.subtotal.m3).toBe(r3(g.columnas.map((c) => c.m3)));
      expect(g.subtotal.piezas).toBe(g.columnas.reduce((a, c) => a + c.piezas, 0));
      expect(g.subtotal.reg).toBe(g.columnas.reduce((a, c) => a + c.reg, 0));
      expect(g.subtotal.pt).toBe(r3(g.columnas.map((c) => c.pt ?? 0)));
      expect(g.columnas.map((c) => c.columna)).toEqual([...g.columnas.map((c) => c.columna)].sort((a, b) => a - b));
      // La hoja suma sus subtotales y cuadra con lo impreso.
      expect(r.cuadra).toBe(true);
    }
  });
});
