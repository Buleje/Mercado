/**
 * Filtros y formato de la cantidad de la vista previa del ANEXO N° 04
 * (Brandon, 2026-10-03). Las piezas se cubican por el camino del cubicador
 * (`cubicarPieza`) y los totales se leen de `construirAnexo04`, el mismo que
 * dibuja la hoja: se compara lo que imprimiría el papel.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import {
  FILTRO_ANEXO_VACIO,
  filtrarFilasAnexo,
  formatoCantidad,
  opcionesFiltroAnexo,
  rotuloFiltroAnexo,
  type FormatoCantidad,
} from "@/lib/forestal/anexo04-vista";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie, ...cubicarPieza(dims), ...extra };
}

/* Comercial (2×8×10, 2×6×10), Larga angosta (2×4×10, 3×3×12), Tabla (1×6×10). */
const LOTE: PiezaCubicada[] = [
  pieza(40, 2, 8, 10, "Tornillo"),
  pieza(30, 2, 6, 10, "Cumala"),
  pieza(20, 2, 4, 10, "Tornillo"),
  pieza(1, 3, 3, 12, "Pashaco"),
  pieza(2, 3, 3, 12, "Pashaco"),
  pieza(5, 1, 6, 10, "Pashaco"),
  pieza(3, 2, 5, 7, "Pashaco"),
];

const totales = (rows: PiezaCubicada[], unidadV: "pt" | "m3" = "pt") => {
  const a = construirAnexo04(rows, { unidadV, modo: "oficial" });
  return { piezas: a.totalPiezas, pt: a.totalPt, m3: a.totalM3, renglones: a.hojas.flatMap((h) => h.bloques).reduce((s, b) => s + b.filas.length, 0) };
};

describe("filtrarFilasAnexo", () => {
  it("por tipo: con Comercial, todos los bloques impresos son COMERCIAL y el total baja", () => {
    const f = filtrarFilasAnexo(LOTE, { tipos: ["Comercial"], especies: [] });
    expect(f.every((r) => tipoDePieza(r) === "Comercial")).toBe(true);
    const anexo = construirAnexo04(f, { unidadV: "pt", modo: "oficial" });
    expect(anexo.hojas.flatMap((h) => h.bloques).map((b) => b.tipo)).toEqual(["COMERCIAL", "COMERCIAL"]);
    expect(anexo.totalPiezas).toBe(70);
  });

  it("por especie: compara contra la especie del bloque (MAYÚSCULA, con el fallback del lote)", () => {
    const sinEspecie = pieza(4, 2, 8, 10);
    const f = filtrarFilasAnexo([...LOTE, sinEspecie], { tipos: [], especies: ["TORNILLO"] }, "Tornillo");
    expect(f.map((r) => r.id)).toEqual([LOTE[0].id, LOTE[2].id, sinEspecie.id]);
  });

  it("ambos: Larga angosta + Pashaco deja sólo las larga angosta de pashaco (3×3×12 y 2×5×7)", () => {
    const f = filtrarFilasAnexo(LOTE, { tipos: ["Larga angosta"], especies: ["PASHACO"] });
    expect(f.map((r) => r.id)).toEqual([LOTE[3].id, LOTE[4].id, LOTE[6].id]);
    expect(totales(f).piezas).toBe(6);
  });

  it("sin filtro devuelve todas", () => {
    expect(filtrarFilasAnexo(LOTE, FILTRO_ANEXO_VACIO)).toHaveLength(LOTE.length);
  });
});

describe("opcionesFiltroAnexo", () => {
  it("cuenta piezas por tipo y especie, cruzado con el otro filtro", () => {
    const libre = opcionesFiltroAnexo(LOTE, FILTRO_ANEXO_VACIO);
    expect(libre.tipos.map((o) => [o.valor, o.piezas])).toEqual([
      ["Comercial", 70], ["Tabla", 5], ["Larga angosta", 26],
    ]);
    expect(libre.especies.map((o) => [o.valor, o.piezas])).toEqual([["TORNILLO", 60], ["CUMALA", 30], ["PASHACO", 11]]);

    const conPashaco = opcionesFiltroAnexo(LOTE, { tipos: [], especies: ["PASHACO"] });
    expect(conPashaco.tipos.find((o) => o.valor === "Larga angosta")?.piezas).toBe(6);
    expect(conPashaco.tipos.find((o) => o.valor === "Comercial")?.piezas).toBe(0);
    expect(conPashaco.especies.find((o) => o.valor === "PASHACO")?.elegida).toBe(true);
  });

  it("una opción elegida que ya no está en las piezas sigue, con 0, para poder quitarla", () => {
    const o = opcionesFiltroAnexo(LOTE, { tipos: ["Otro"], especies: ["SHIHUAHUACO"] });
    expect(o.tipos.find((t) => t.valor === "Otro")).toMatchObject({ piezas: 0, elegida: true });
    expect(o.especies.find((e) => e.valor === "SHIHUAHUACO")).toMatchObject({ piezas: 0, elegida: true });
  });

  it("rótulo legible: tipos en orden canónico · especies con mayúscula inicial", () => {
    expect(rotuloFiltroAnexo({ tipos: ["Larga angosta", "Comercial"], especies: ["PALO ROSA"] })).toBe("Comercial, Larga angosta · Palo Rosa");
  });
});

describe("formatoCantidad", () => {
  const FORMATOS: FormatoCantidad[] = ["cargada", "sumada", "unidad"];

  it.each(["pt", "m3"] as const)("los tres formatos conservan Σ piezas, PT y m³ (V en %s)", (unidadV) => {
    const base = totales(LOTE, unidadV);
    for (const fmt of FORMATOS) {
      const t = totales(formatoCantidad(LOTE, fmt), unidadV);
      expect({ fmt, piezas: t.piezas, pt: t.pt, m3: t.m3 }).toEqual({ fmt, piezas: base.piezas, pt: base.pt, m3: base.m3 });
    }
  });

  it("los tres conservan también el m³ guardado por fila sumado (lo que compara «Comparar con el resumen»)", () => {
    const m3 = (rows: PiezaCubicada[]) => Math.round(rows.reduce((a, r) => a + r.m3, 0) * 10_000);
    const pt = (rows: PiezaCubicada[]) => Math.round(rows.reduce((a, r) => a + r.pieTablar, 0) * 100);
    for (const fmt of FORMATOS) {
      expect(m3(formatoCantidad(LOTE, fmt))).toBe(m3(LOTE));
      expect(pt(formatoCantidad(LOTE, fmt))).toBe(pt(LOTE));
    }
  });

  it("«Una por pieza»: renglones = Σ cantidad, todas con cantidad 1, ids estables y únicas", () => {
    const u = formatoCantidad(LOTE, "unidad");
    const piezas = LOTE.reduce((a, r) => a + r.cantidad, 0);
    expect(u).toHaveLength(piezas);
    expect(u.every((r) => r.cantidad === 1)).toBe(true);
    expect(new Set(u.map((r) => r.id)).size).toBe(piezas);
    expect(formatoCantidad(LOTE, "unidad").map((r) => r.id)).toEqual(u.map((r) => r.id));
    expect(u.filter((r) => r.id.startsWith(`${LOTE[4].id}~`)).map((r) => r.id)).toEqual([`${LOTE[4].id}~1`, `${LOTE[4].id}~2`]);
    expect(totales(u).renglones).toBe(piezas);
  });

  it("«Una por pieza» no choca con un id que ya existía", () => {
    const a = pieza(2, 2, 8, 10, "Tornillo", { id: "a" });
    const choca = pieza(1, 2, 8, 10, "Tornillo", { id: "a~1" });
    const ids = formatoCantidad([a, choca], "unidad").map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("«Sumada»: dos filas iguales (1 + 2 de 3×3×12) quedan en UNA línea de 3", () => {
    const s = formatoCantidad(LOTE, "sumada");
    expect(s).toHaveLength(LOTE.length - 1);
    const linea = s.find((r) => r.espesor === 3 && r.ancho === 3);
    expect(linea).toMatchObject({ id: `s-${LOTE[3].id}`, cantidad: 3 });
    // m³ = suma de las dos guardadas, no el recalculado del grupo.
    expect(linea!.m3).toBe(Math.round((LOTE[3].m3 + LOTE[4].m3) * 10_000) / 10_000);
  });

  it("«Sumada» de «Una por pieza» vuelve a las líneas de siempre", () => {
    const ida = formatoCantidad(formatoCantidad(LOTE, "unidad"), "sumada");
    expect(ida.map((r) => [r.cantidad, r.espesor, r.ancho, r.largo])).toEqual(
      formatoCantidad(LOTE, "sumada").map((r) => [r.cantidad, r.espesor, r.ancho, r.largo]),
    );
  });

  it("«Sumada» no junta especies, tipos forzados ni dueños distintos", () => {
    const rows = [
      pieza(1, 3, 3, 12, "Pashaco"),
      pieza(1, 3, 3, 12, "Tornillo"),
      pieza(1, 3, 3, 12, "Pashaco", { tipo: "Corta" }),
      pieza(1, 3, 3, 12, "Pashaco", { dueno: "López" }),
    ];
    expect(formatoCantidad(rows, "sumada")).toHaveLength(4);
  });

  it("«Como se cargó» deja las filas tal cual (mismos ids: lo único editable)", () => {
    expect(formatoCantidad(LOTE, "cargada").map((r) => r.id)).toEqual(LOTE.map((r) => r.id));
  });
});
