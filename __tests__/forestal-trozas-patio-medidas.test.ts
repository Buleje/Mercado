import { describe, expect, it } from "vitest";
import {
  cifrasExtraPatio,
  diametroEquivalenteCm,
  faltanMedidas,
  medidasDePieza,
  piezasSinTitulo,
  volumenHuberM3,
  type PiezaDelPatio,
} from "@/lib/forestal/trozas-patio-medidas";

const pieza = (o: Partial<PiezaDelPatio> = {}): PiezaDelPatio => ({
  id: o.id ?? "t1",
  especieComun: "Tornillo",
  volumenM3: 2,
  gtfNumber: "001",
  fechaIngreso: "2026-09-01",
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  guiaRecepcionada: true,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  loteAserrioCode: null,
  permiso: "CONC-1",
  ...o,
});

describe("medidasDePieza — de dónde sale cada punta", () => {
  it("la guía manda cuando trae las dos", () => {
    expect(medidasDePieza({ d1Cm: 64, d2Cm: 60, recibidaD1Cm: 70, recibidaD2Cm: 70 })).toEqual({ d1: 64, d2: 60, fuente: "guia" });
  });
  it("lo cargado por la planta sobre un NULL se marca como planta", () => {
    expect(medidasDePieza({ d1Cm: 50, d2Cm: 48, d1d2MedidoEnPlanta: true }).fuente).toBe("planta");
  });
  it("sin guía, usa lo medido al recibirla", () => {
    expect(medidasDePieza({ d1Cm: null, recibidaD1Cm: 70, recibidaD2Cm: 66 })).toEqual({ d1: 70, d2: 66, fuente: "recibida" });
  });
  it("Oxapampa en pulgadas se pasa a cm", () => {
    expect(medidasDePieza({ oxD1Pulg: 25, oxD2Pulg: 24 })).toEqual({ d1: 63.5, d2: 61, fuente: "oxapampa" });
  });
  it("no mezcla el D1 de una fuente con el D2 de otra", () => {
    expect(medidasDePieza({ d1Cm: 60, d2Cm: null, recibidaD2Cm: 58 })).toEqual({ d1: 60, d2: null, fuente: "guia" });
  });
  it("sin nada: null, nunca 0", () => {
    expect(medidasDePieza({})).toEqual({ d1: null, d2: null, fuente: null });
    expect(medidasDePieza({ d1Cm: 0, d2Cm: 0 })).toEqual({ d1: null, d2: null, fuente: null });
  });
  it("faltanMedidas cuenta la que tiene una sola punta", () => {
    expect(faltanMedidas({ d1Cm: 60 })).toBe(true);
    expect(faltanMedidas({ d1Cm: 60, d2Cm: 58 })).toBe(false);
  });
});

describe("Huber — el volumen y el diámetro equivalente", () => {
  it("reproduce un volumen de guía de SERFOR (100 × 96 × 6.5 → 4.903)", () => {
    expect(volumenHuberM3(100, 96, 6.5)).toBeCloseTo(4.903, 3);
  });
  it("el diámetro equivalente vuelve al promedio", () => {
    expect(diametroEquivalenteCm(4.9033, 6.5)).toBe(98);
  });
  it("sin largo o volumen no inventa", () => {
    expect(diametroEquivalenteCm(null, 6)).toBeNull();
    expect(volumenHuberM3(60, null, 6)).toBeNull();
  });
});

describe("cifrasExtraPatio — sólo lo que sigue parado", () => {
  const trozas = [
    pieza({ id: "a", d1Cm: 60, d2Cm: 56, largoM: 6, volumenM3: 1.5, etiquetadaEn: "2026-09-30T00:00:00Z" }),
    pieza({ id: "b", oxD1Pulg: 20, oxD2Pulg: 20, oxPt: 120, largoM: 5, volumenM3: 1 }),
    pieza({ id: "c", largoM: 8, volumenM3: 3 }),
    /* Aserrada: no cuenta para el calibre de la sierra. */
    pieza({ id: "d", d1Cm: 120, d2Cm: 118, consumidaEnId: "x", largoM: 9, volumenM3: 9 }),
  ];
  const c = cifrasExtraPatio(trozas);
  it("cuenta medidas, calibre y mayor sobre el patio", () => {
    expect(c.enPatio).toBe(3);
    expect(c.conMedidas).toBe(2);
    expect(c.sinMedidas).toBe(1);
    expect(c.calibrePromedioCm).toBe(54.4); // (58 + 50.8) / 2
    expect(c.calibreMayorCm).toBe(60);
  });
  it("largo, volumen por pieza, etiquetas y Oxapampa", () => {
    expect(c.largoPromedioM).toBe(6.33);
    expect(c.largoMayorM).toBe(8);
    expect(c.m3PromedioPorPieza).toBe(1.833);
    expect(c.m3MayorPieza).toBe(3);
    expect(c.etiquetadas).toBe(1);
    expect(c.cubicadasOx).toBe(1);
    expect(c.ptOx).toBe(120);
  });
});

describe("piezasSinTitulo", () => {
  it("sólo las del patio sin permiso (vacío o espacios)", () => {
    const r = piezasSinTitulo([
      pieza({ id: "a", permiso: null }),
      pieza({ id: "b", permiso: "  " }),
      pieza({ id: "c" }),
      pieza({ id: "d", permiso: null, despachadaEnId: "z" }),
    ]);
    expect(r.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
