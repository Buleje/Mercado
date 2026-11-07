/**
 * La casilla «Lote» de la hoja de cubicación (Brandon 30-10, «Lote para la
 * madera suelta»): la pieza anotada con su lote va SÓLO al bloque de ese lote
 * en la Distribución de rolliza, y la línea de producción del lote toma su
 * volumen exacto. Sin casilla llena, todo sigue igual que antes.
 */
import { describe, expect, it } from "vitest";
import { loteQueEsFecha, normalizarLote, parsearFilasImportadas, PLANTILLA_IMPORT } from "@/lib/forestal/cubicacion-import";
import { PT_POR_M3, unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import {
  avisoLotesSinBloque,
  codigoDeLote,
  codigoLoteDeBloque,
  lotesSinBloqueDe,
  partirPorLote,
} from "@/lib/forestal/cubicacion-reparto-por-lote";

/* Mil tablas por renglón: el reparto asigna piezas ENTERAS (ver forestal-cubicacion-reparto.test). */
function pieza(id: string, m3: number, lote?: string, especie = "Tornillo"): PiezaCubicada {
  return {
    id, cantidad: 1000, espesor: 2, ancho: 8, largo: 10,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
    especie, m3, pieTablar: Math.round(m3 * PT_POR_M3 * 100) / 100,
    ...(lote ? { lote } : {}),
  };
}
const bloque = (id: string, etiqueta: string, m3: number, especie = "Tornillo"): BloqueRolliza => ({
  id, etiqueta, especie, m3, aprovechablePct: 50, origen: "lote",
});
const usado = (d: ReturnType<typeof distribuirPorCapacidad>, id: string) =>
  d.especies.flatMap((e) => e.bloques).find((b) => b.bloque.id === id)?.usadoM3;

describe("la casilla Lote al importar el Excel", () => {
  it("la plantilla trae la columna Lote al final (una planilla vieja se sigue leyendo)", () => {
    expect(PLANTILLA_IMPORT.headers.at(-1)).toBe("Lote");
    const vieja = parsearFilasImportadas([["Especie", "Espesor", "Ancho", "Largo"], ["Tornillo", 2, 8, 10]]);
    expect(vieja.errores).toEqual([]);
    expect(vieja.piezas[0]?.lote).toBeUndefined();
  });

  it("cada fila guarda su lote; la que no lo dice queda sin lote", () => {
    const r = parsearFilasImportadas([
      ["Especie", "Cantidad", "Espesor", "Ancho", "Largo", "N° lote"],
      ["Tornillo", 5, 2, 8, 10, "Lote 29-2026"],
      ["Tornillo", 3, 2, 8, 10, ""],
      ["Tornillo", 2, 1, 4, 8, 30],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.piezas.map((p) => p.lote)).toEqual(["29-2026", undefined, "30"]);
  });

  /* Excel guarda «10-2026» como el 1-oct-2026 (serial 46296): leído así no cruza con su bloque. */
  it("un lote que Excel volvió fecha entra sin lote y con aviso", () => {
    expect(loteQueEsFecha(46296)).toBe("10-2026");
    expect(loteQueEsFecha("2026-10-01")).toBe("10-2026");
    expect(loteQueEsFecha("oct-26")).toBe("10-2026");
    expect(loteQueEsFecha("29/10/2026")).toBe("29-10");
    for (const lote of [29, "29-2026", "Lote 30", "", null, 2026]) expect(loteQueEsFecha(lote)).toBeNull();
    const r = parsearFilasImportadas([
      ["Especie", "Espesor", "Ancho", "Largo", "Lote"],
      ["Tornillo", 2, 8, 10, 46296],
      ["Tornillo", 2, 8, 10, "29-2026"],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.piezas.map((p) => p.lote)).toEqual([undefined, "29-2026"]);
    expect(r.avisos).toEqual([{ fila: 2, motivo: expect.stringContaining("«10-2026»") }]);
    expect(parsearFilasImportadas([["Espesor", "Ancho", "Largo"], [2, 8, 10]]).avisos).toBeUndefined();
  });

  it("normalizarLote limpia lo que el operario escribe", () => {
    expect(normalizarLote("  lote n° 29-2026 ")).toBe("29-2026");
    expect(normalizarLote(29)).toBe("29");
    expect(normalizarLote("")).toBeUndefined();
    expect(normalizarLote(null)).toBeUndefined();
  });

  it("unificar por medida no junta tablas de lotes distintos", () => {
    const u = unificarPorMedida([pieza("a", 1, "29-2026"), pieza("b", 1, "30-2026"), pieza("c", 1, "29-2026")]);
    expect(u.map((p) => `${p.lote}:${p.cantidad}`).sort()).toEqual(["29-2026:2000", "30-2026:1000"]);
  });
});

describe("el código del lote se compara sin ceros ni prefijos", () => {
  it("«Lote 029-2026», «29-2026» y «29 / 2026» son el mismo", () => {
    expect(codigoDeLote("Lote 029-2026")).toBe("29-2026");
    expect(codigoDeLote("29 / 2026")).toBe("29-2026");
    expect(codigoDeLote("")).toBeNull();
  });

  it("el bloque dice su lote por la etiqueta, con apartado o margen", () => {
    expect(codigoLoteDeBloque({ etiqueta: "Lote 29-2026" })).toBe("29-2026");
    expect(codigoLoteDeBloque({ etiqueta: "Lote 29-2026 · apartado" })).toBe("29-2026");
    expect(codigoLoteDeBloque({ etiqueta: "GTF 019-001-0000012" })).toBeNull();
  });

  it("«29» a secas va al 29-2026 sólo si no hay otro 29", () => {
    const uno = partirPorLote([bloque("a", "Lote 29-2026", 20)], [pieza("p", 1, "29")]);
    expect(uno.find((p) => p.lote === "29-2026")?.piezas).toHaveLength(1);
    /* Con dos lotes 29 no se adivina: queda aparte (faltante con aviso), en ninguno de los dos. */
    const dos = partirPorLote(
      [bloque("a", "Lote 29-2026", 20), bloque("b", "Lote 29-2025", 20)],
      [pieza("p", 1, "29")],
    );
    expect(dos.find((p) => p.sinBloque)).toMatchObject({ lote: "29", bloques: [] });
    expect(dos.find((p) => p.sinBloque)?.piezas.map((p) => p.id)).toEqual(["p"]);
    expect(dos.filter((p) => !p.sinBloque).flatMap((p) => p.piezas)).toEqual([]);
  });
});

describe("la Distribución de rolliza respeta el lote de cada pieza", () => {
  const bloques = [bloque("L29", "Lote 29-2026", 20), bloque("L30", "Lote 30-2026", 20)];

  it("cada lote recibe SÓLO sus tablas: la línea de producción sale exacta", () => {
    const d = distribuirPorCapacidad(bloques, [pieza("a", 6, "29-2026"), pieza("b", 3, "30-2026")]);
    expect(usado(d, "L29")).toBeCloseTo(6, 3);
    expect(usado(d, "L30")).toBeCloseTo(3, 3);
    expect(d.especies).toHaveLength(1);
    expect(d.especies[0]?.aserradaM3).toBeCloseTo(9, 3);
    expect(d.especies[0]?.bloques.map((b) => b.bloque.id)).toEqual(["L29", "L30"]);
  });

  it("sin casilla llena el 29 se llena primero, como siempre", () => {
    const d = distribuirPorCapacidad(bloques, [pieza("a", 6), pieza("b", 3)]);
    expect((usado(d, "L29") ?? 0) + (usado(d, "L30") ?? 0)).toBeCloseTo(9, 3);
    expect(usado(d, "L30")).not.toBeCloseTo(3, 3);
  });

  it("lo que no cabe en su lote queda faltante: no se pasa al lote vecino", () => {
    const d = distribuirPorCapacidad(bloques, [pieza("a", 12, "29-2026")]);
    expect(usado(d, "L29")).toBeLessThanOrEqual(10 + 1e-6);
    expect(usado(d, "L30") ?? 0).toBe(0);
    expect(d.especies[0]?.faltanteM3).toBeGreaterThan(1.9);
  });

  /* El lote 30 no tiene ninguna tabla anotada: sigue en el reparto de siempre. */
  it("la pieza SIN lote va a los demás bloques; la de un lote sin bloque queda faltante con aviso", () => {
    const d = distribuirPorCapacidad(
      [...bloques, bloque("G", "GTF 019-001-0000012", 20)],
      [pieza("a", 4, "29-2026"), pieza("b", 2), pieza("c", 1, "77-2026")],
    );
    expect(usado(d, "L29")).toBeCloseTo(4, 3);
    expect((usado(d, "L30") ?? 0) + (usado(d, "G") ?? 0)).toBeCloseTo(2, 3);
    expect(d.especies[0]?.faltanteM3).toBeCloseTo(1, 3);
    expect(d.especies[0]?.lotesSinBloque).toEqual([{ lote: "77-2026", piezas: 1000, m3: 1 }]);
  });

  /* Revisión 30-10: el lote mal escrito llenaba EN SILENCIO el bloque de otro lote. */
  it("un lote que no existe no se mete en el bloque del otro lote", () => {
    const d = distribuirPorCapacidad(bloques, [pieza("a", 2, "29-2026"), pieza("x", 5, "77-2026")]);
    expect(usado(d, "L29")).toBeCloseTo(2, 3);
    expect(usado(d, "L30") ?? 0).toBe(0);
    expect(d.especies[0]?.faltanteM3).toBeCloseTo(5, 3);
    expect(d.especies[0]?.faltante.reduce((a, f) => a + f.piezas, 0)).toBe(1000);
    expect(avisoLotesSinBloque(d.especies[0]?.lotesSinBloque ?? [])).toBe(
      "1000 piezas con lote que no está en esta especie (77-2026): no se reparten a otro lote. " +
        "Revisa el lote anotado o carga el bloque de ese lote.",
    );
  });

  it("sin piezas de un lote sin bloque no hay aviso", () => {
    const d = distribuirPorCapacidad(bloques, [pieza("a", 2, "29-2026"), pieza("b", 1)]);
    expect(d.especies[0]?.lotesSinBloque).toBeUndefined();
    expect(lotesSinBloqueDe(partirPorLote(bloques, [pieza("a", 2, "29-2026")]))).toEqual([]);
    expect(avisoLotesSinBloque([])).toBeNull();
  });

  it("con bloques sin lote, anotar el lote en la pieza no cambia nada", () => {
    const gtf = [bloque("g1", "GTF-1", 20), bloque("g2", "GTF-2", 20)];
    const conLote = distribuirPorCapacidad(gtf, [pieza("a", 6, "29-2026"), pieza("b", 3, "30-2026")]);
    const sinLote = distribuirPorCapacidad(gtf, [pieza("a", 6), pieza("b", 3)]);
    expect(conLote).toEqual(sinLote);
  });

  it("otra especie no se mezcla con el lote del tornillo", () => {
    const d = distribuirPorCapacidad(
      [...bloques, bloque("C", "Lote 31-2026", 10, "Copaiba")],
      [pieza("a", 2, "29-2026"), pieza("b", 2, "31-2026", "Copaiba")],
    );
    expect(usado(d, "L29")).toBeCloseTo(2, 3);
    expect(usado(d, "C")).toBeCloseTo(2, 3);
    expect(d.especies).toHaveLength(2);
  });
});
