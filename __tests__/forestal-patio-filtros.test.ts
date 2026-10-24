/**
 * Filtros nuevos del patio (ADR-431): días en el patio por tramo, largo,
 * diámetro, sin código y guía CITES — y sus facetas, que deciden si el control
 * se muestra (un filtro que no puede devolver nada se esconde).
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  diametroDe,
  esSinCodigo,
  facetasDePatio,
  filtrarPatio,
  tramoDeDias,
} from "@/lib/forestal/patio-resumen";

const AHORA = new Date("2026-09-24T12:00:00-05:00");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

let n = 0;
function troza(over: Partial<TrozaConsumible> = {}): TrozaConsumible {
  n += 1;
  return {
    id: over.id ?? `t${n}`,
    woodEntryId: "w1",
    codificacion: `C-${n}`,
    especieComun: "Tornillo",
    volumenM3: 1,
    permiso: "P-1",
    fechaIngreso: haceDias(5),
    ...over,
  };
}

const ids = (xs: TrozaConsumible[]) => xs.map((t) => t.id).sort();

describe("tramoDeDias — la escala única 0-14 · 15-29 · 30-59 · 60+", () => {
  it.each([
    [0, "hasta15"],
    [14, "hasta15"],
    [15, "16a30"],
    [16, "16a30"],
    [29, "16a30"],
    [30, "31a60"],
    [31, "31a60"],
    [59, "31a60"],
    [60, "mas60"],
    [61, "mas60"],
    [9999, "mas60"],
  ] as const)("%i días → %s", (dias, tramo) => {
    expect(tramoDeDias(dias)).toBe(tramo);
  });

  it("sin dato no inventa un tramo", () => {
    expect(tramoDeDias(null)).toBeNull();
    expect(tramoDeDias(undefined)).toBeNull();
    expect(tramoDeDias(Number.NaN)).toBeNull();
  });
});

describe("filtrarPatio — días, medidas, sin código y CITES", () => {
  const fresca = troza({ id: "fresca", fechaIngreso: haceDias(3) });
  const media = troza({ id: "media", fechaIngreso: haceDias(20) });
  const vieja = troza({ id: "vieja", fechaIngreso: haceDias(90) });
  const sinFecha = troza({ id: "sin-fecha", fechaIngreso: null });
  const porRecibir = troza({ id: "por-recibir", fechaIngreso: haceDias(90), guiaRecepcionada: false });
  const pila = [fresca, media, vieja, sinFecha, porRecibir];

  it("tramos = OR adentro del campo", () => {
    expect(ids(filtrarPatio(pila, { tramos: ["hasta15", "mas60"] }, AHORA))).toEqual(["fresca", "vieja"]);
  });

  it("sin fecha, o por recepcionar (no está en el patio), no cae en ningún tramo", () => {
    const todos = filtrarPatio(pila, { tramos: ["hasta15", "16a30", "31a60", "mas60"] }, AHORA);
    expect(ids(todos)).toEqual(["fresca", "media", "vieja"]);
  });

  it("largo {min:3} AND especie AND permiso = intersección", () => {
    const xs = [
      troza({ id: "si", largoM: 4, especieComun: "Cumala", permiso: "P-9" }),
      troza({ id: "corta", largoM: 2.5, especieComun: "Cumala", permiso: "P-9" }),
      troza({ id: "otra-especie", largoM: 5, especieComun: "Tornillo", permiso: "P-9" }),
      troza({ id: "otro-permiso", largoM: 5, especieComun: "Cumala", permiso: "P-1" }),
      troza({ id: "sin-largo", largoM: null, especieComun: "Cumala", permiso: "P-9" }),
    ];
    expect(ids(filtrarPatio(xs, { largoM: { min: 3 }, especie: ["cumala"], permiso: "P-9" }, AHORA))).toEqual(["si"]);
  });

  it("los bordes del rango se incluyen", () => {
    const xs = [troza({ id: "3", largoM: 3 }), troza({ id: "5", largoM: 5 }), troza({ id: "5.01", largoM: 5.01 })];
    expect(ids(filtrarPatio(xs, { largoM: { min: 3, max: 5 } }, AHORA))).toEqual(["3", "5"]);
  });

  it("un rango sin bordes (o con bordes no numéricos) no filtra nada", () => {
    const xs = [troza({ largoM: null }), troza({ largoM: 2 })];
    expect(filtrarPatio(xs, { largoM: {} }, AHORA)).toHaveLength(2);
    expect(filtrarPatio(xs, { largoM: { min: Number.NaN } }, AHORA)).toHaveLength(2);
  });

  it("con un rango de diámetro, la pieza SIN diámetro queda fuera", () => {
    const xs = [
      troza({ id: "declarado", diametroCm: 45 }),
      troza({ id: "extremos", d1Cm: 40, d2Cm: 50 }),
      troza({ id: "un-extremo", d1Cm: 60, d2Cm: null }),
      troza({ id: "sin-dato" }),
      troza({ id: "fino", diametroCm: 20 }),
    ];
    expect(ids(filtrarPatio(xs, { diametroCm: { min: 40, max: 60 } }, AHORA))).toEqual(["declarado", "extremos", "un-extremo"]);
  });

  it("sinCodigo trae null, vacío, «-» y « - »; no «A-1»", () => {
    const xs = [
      troza({ id: "null", codificacion: null }),
      troza({ id: "vacio", codificacion: "" }),
      troza({ id: "guion", codificacion: "-" }),
      troza({ id: "guion-espacios", codificacion: " - " }),
      troza({ id: "con-codigo", codificacion: "A-1" }),
      troza({ id: "numero", codificacion: "25" }),
    ];
    expect(ids(filtrarPatio(xs, { sinCodigo: true }, AHORA))).toEqual(["guion", "guion-espacios", "null", "vacio"]);
  });

  it("cites lee la GUÍA (guiaCites), no la especie de la troza", () => {
    const xs = [
      troza({ id: "guia-cites", guiaCites: true, especieComun: "Panguana" }),
      troza({ id: "guia-comun", guiaCites: false, especieComun: "Cedro" }),
      troza({ id: "sin-dato" }),
    ];
    expect(ids(filtrarPatio(xs, { cites: true }, AHORA))).toEqual(["guia-cites"]);
  });

  it("retrocompatible: la llamada vieja sin `ahora` sigue funcionando", () => {
    const xs = [troza({ id: "t", especieComun: "Capirona" }), troza({ id: "u", especieComun: "Tornillo" })];
    expect(ids(filtrarPatio(xs, { especie: "capirona" }))).toEqual(["t"]);
  });
});

describe("diametroDe / esSinCodigo", () => {
  it("diámetro: el declarado manda; si no, el promedio de los extremos que haya; si no, null", () => {
    expect(diametroDe({ diametroCm: 44, d1Cm: 10, d2Cm: 20 })).toBe(44);
    expect(diametroDe({ d1Cm: 41, d2Cm: 44 })).toBe(42.5);
    expect(diametroDe({ d1Cm: null, d2Cm: 38 })).toBe(38);
    expect(diametroDe({ diametroCm: 0, d1Cm: 0 })).toBeNull();
    expect(diametroDe({})).toBeNull();
  });

  it("«—» y «..» también son sin código; «0» no", () => {
    expect(esSinCodigo({ codificacion: "—" })).toBe(true);
    expect(esSinCodigo({ codificacion: ".." })).toBe(true);
    expect(esSinCodigo({ codificacion: "0" })).toBe(false);
  });
});

describe("facetasDePatio — deciden si cada control se muestra", () => {
  const xs = [
    troza({ largoM: 2.19, fechaIngreso: haceDias(16), codificacion: "-" }),
    troza({ largoM: 9.7, fechaIngreso: haceDias(16), guiaCites: true }),
    troza({ largoM: null, d1Cm: 40, d2Cm: 44, fechaIngreso: haceDias(70) }),
    troza({ largoM: 5, fechaIngreso: haceDias(70), guiaRecepcionada: false }),
  ];
  const f = facetasDePatio(xs, AHORA);

  it("cuenta con dato, mínimo y máximo", () => {
    expect(f.largo).toEqual({ conDato: 3, min: 2.19, max: 9.7 });
    expect(f.diametro).toEqual({ conDato: 1, min: 42, max: 42 });
  });

  it("tramos (lo por recepcionar no tiene), sin código y guía CITES", () => {
    expect(f.tramos).toEqual({ hasta15: 0, "16a30": 2, "31a60": 0, mas60: 1 });
    expect(f.sinCodigo).toBe(1);
    expect(f.cites).toBe(1);
  });

  it("sin datos → conDato 0 y bordes null (el control se esconde)", () => {
    const vacio = facetasDePatio([troza({ largoM: null })], AHORA);
    expect(vacio.diametro).toEqual({ conDato: 0, min: null, max: null });
    expect(vacio.largo.conDato).toBe(0);
    expect(vacio.sinCodigo).toBe(0);
    expect(vacio.cites).toBe(0);
  });

  it("las facetas de columna de siempre siguen ahí", () => {
    expect(f.especies[0]).toEqual({ value: "Tornillo", count: 4 });
    expect(f.permisos).toEqual([{ value: "P-1", count: 4 }]);
  });
});
