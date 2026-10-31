/**
 * El talonario de la GTF de salida (ADR-446, punto 7) — la parte PURA.
 *
 * Las fixtures son las del 28-09: en Blas «Emitir GTF» puso `19-00000-000001`
 * y `-000002` (la Ficha decía `19-00000` y el relleno era a 6), cuando el
 * talonario real es `19-001` a 7 dígitos y su último número usado —el 064—
 * vivía sólo en un Anexo 04 guardado. En `main` la serie es `GTF-001` a 6.
 */
import { describe, expect, it } from "vitest";
import {
  correlativoEnSerie,
  digitosGtfValidos,
  fuenteGtfTexto,
  gtfEnUso,
  leerGtfConfirmada,
  mismoNumeroGtf,
  proponerGtf,
  saltoDeCorrelativo,
  serieGtfValida,
  type GtfUsada,
} from "@/lib/forestal/gtf-talonario";
import { emptyCtpFicha, normalizeCtpFicha } from "@/lib/forestal/ctp-ficha-types";

/** Los 10 Anexos 04 guardados de Blas (KV `ctp-anexos:<id>`, medido 28-09). */
const ANEXOS_BLAS: GtfUsada[] = [
  ["2-19-0480621", "19-001-0000064", "2026-09-25"],
  ["2-19-0480369", "19-001-0000064", "2026-09-24"],
  ["2-19-0480368", "19-001-0000063", "2026-09-24"],
  ["2-19-0475241", "19-001-0000062", "2026-09-09"],
  ["2-19-0475239", "19-001-0000060", "2026-09-09"],
  ["2-19-0467889", "19-001-0000057", "2026-08-18"],
  ["2-19-0467898", "19-001-0000058", "2026-08-18"],
  ["2-19-0464128", "19-001-0000054", "2026-08-07"],
  ["2-19-0464136", "19-001-0000056", "2026-08-07"],
  ["2-19-0464134", "19-001-0000055", "2026-08-07"],
].map(([anexoNumero, numero, fecha]) => ({ numero, fuente: "anexo" as const, anexoNumero, fecha, despachoId: null }));

/** Las dos pruebas de Blas, anuladas el 28-09 (otra serie: no son del talonario). */
const ANULADOS_BLAS: GtfUsada[] = [
  { numero: "19-00000-000001", fuente: "despacho_anulado", despachoId: "d1", lineNo: 1, fecha: "2026-09-27" },
  { numero: "19-00000-000002", fuente: "despacho_anulado", despachoId: "d4", lineNo: 4, fecha: "2026-09-27" },
];

describe("un número se compara por tramos", () => {
  it("019-001-0000064 es la misma guía que 19-001-0000064", () => {
    expect(mismoNumeroGtf("019-001-0000064", "19-001-0000064")).toBe(true);
    expect(mismoNumeroGtf(" 19 - 001 - 64 ", "019-001-0000064")).toBe(true);
    expect(mismoNumeroGtf("gtf-001-3", "GTF-001-000003")).toBe(true);
  });

  it("otro correlativo, otra serie u otro largo no son la misma", () => {
    expect(mismoNumeroGtf("19-001-0000064", "19-001-0000065")).toBe(false);
    expect(mismoNumeroGtf("19-001-0000064", "19-002-0000064")).toBe(false);
    expect(mismoNumeroGtf("19-001-0000064", "001-0000064")).toBe(false);
    expect(mismoNumeroGtf("", "")).toBe(false);
  });

  it("el correlativo sale del tramo final, con sus dígitos", () => {
    expect(correlativoEnSerie("019-001-0000064", "19-001")).toEqual({ correlativo: 64, digitos: 7 });
    expect(correlativoEnSerie("GTF-001-000003", "GTF-001")).toEqual({ correlativo: 3, digitos: 6 });
  });

  it("lo que no es de la serie no cuenta: las pruebas de Blas, los textos de QA", () => {
    expect(correlativoEnSerie("19-00000-000001", "19-001")).toBeNull();
    expect(correlativoEnSerie("19-001-QA0003", "19-001")).toBeNull();
    expect(correlativoEnSerie("19-001", "19-001")).toBeNull();
    expect(correlativoEnSerie("19-001-0000000", "19-001")).toBeNull();
    expect(correlativoEnSerie(null, "19-001")).toBeNull();
  });
});

describe("proponerGtf — el siguiente del talonario", () => {
  it("Blas: serie 19-001 a 7 dígitos, el último en un Anexo 04 → 19-001-0000065", () => {
    const p = proponerGtf("19-001", 7, [...ANULADOS_BLAS, ...ANEXOS_BLAS]);
    expect(p.gtf).toBe("19-001-0000065");
    expect(p.correlativo).toBe(65);
    expect(p.digitos).toBe(7);
    expect(p.origenDigitos).toBe("ficha");
    expect(p.ultimo?.fuente).toBe("anexo");
    expect(p.ultimo?.anexoNumero).toBe("2-19-0480621");
  });

  it("sin dígitos en la Ficha usa los del último número de la serie", () => {
    const p = proponerGtf("19-001", null, ANEXOS_BLAS);
    expect(p.gtf).toBe("19-001-0000065");
    expect(p.origenDigitos).toBe("ultimo");
  });

  it("serie virgen: arranca en 1 a 7 dígitos", () => {
    const p = proponerGtf("19-001", null, ANULADOS_BLAS);
    expect(p.gtf).toBe("19-001-0000001");
    expect(p.origenDigitos).toBe("defecto");
    expect(p.ultimo).toBeNull();
  });

  it("los anulados cuentan: un número usado no vuelve", () => {
    const anulado: GtfUsada = { numero: "19-001-0000070", fuente: "despacho_anulado", despachoId: "x", lineNo: 9 };
    expect(proponerGtf("19-001", 7, [...ANEXOS_BLAS, anulado]).gtf).toBe("19-001-0000071");
  });

  it("los tipeados a mano en otra notación también cuentan (019-…)", () => {
    const tipeado: GtfUsada = { numero: "019-001-0000066", fuente: "despacho", despachoId: "y", lineNo: 10 };
    expect(proponerGtf("19-001", 7, [...ANEXOS_BLAS, tipeado]).gtf).toBe("19-001-0000067");
  });

  it("main intacto: GTF-001 a 6 dígitos sigue a 6 (GTF-001-000004)", () => {
    const main: GtfUsada[] = [
      { numero: "GTF-001-000001", fuente: "despacho", despachoId: "m1", lineNo: 1 },
      { numero: "GTF-001-000002", fuente: "despacho_anulado", despachoId: "m24", lineNo: 24 },
      { numero: "GTF-001-000003", fuente: "despacho", despachoId: "m37", lineNo: 37 },
      { numero: "19-001-QA0003", fuente: "despacho_anulado", despachoId: "m2", lineNo: 2 },
      { numero: "19-001-QAS005", fuente: "anexo" },
    ];
    const p = proponerGtf("GTF-001", null, main);
    expect(p.gtf).toBe("GTF-001-000004");
    expect(p.digitos).toBe(6);
    expect(p.origenDigitos).toBe("ultimo");
  });
});

describe("leerGtfConfirmada — lo que el operador confirma o cambia", () => {
  it("cualquier notación de la serie queda en la forma de la Ficha", () => {
    expect(leerGtfConfirmada("019-001-65", "19-001", 7)).toEqual({ ok: true, gtf: "19-001-0000065", correlativo: 65 });
    expect(leerGtfConfirmada("19-001-0000065", "19-001", 7)).toEqual({ ok: true, gtf: "19-001-0000065", correlativo: 65 });
  });

  it("sólo el correlativo también vale", () => {
    expect(leerGtfConfirmada("65", "19-001", 7)).toMatchObject({ ok: true, gtf: "19-001-0000065" });
    expect(leerGtfConfirmada("0000065", "19-001", 7)).toMatchObject({ ok: true, gtf: "19-001-0000065" });
  });

  it("otra serie, el número pegado sin guiones o texto: no", () => {
    expect(leerGtfConfirmada("19-002-0000065", "19-001", 7).ok).toBe(false);
    expect(leerGtfConfirmada("19-00000-000003", "19-001", 7).ok).toBe(false);
    expect(leerGtfConfirmada("190010000065", "19-001", 7).ok).toBe(false);
    expect(leerGtfConfirmada("abc", "19-001", 7).ok).toBe(false);
    expect(leerGtfConfirmada("0", "19-001", 7).ok).toBe(false);
  });
});

describe("gtfEnUso — sólo bloquea otro despacho VIGENTE", () => {
  const vigente: GtfUsada = { numero: "019-001-0000065", fuente: "despacho", despachoId: "d6", lineNo: 6 };
  it("el mismo número en otra notación, en otro despacho vigente, se rechaza", () => {
    expect(gtfEnUso("19-001-0000065", [vigente], "d5")).toBe(vigente);
  });
  it("confirmar que es la misma guía destraba sólo contra la línea que lo lleva", () => {
    expect(gtfEnUso("19-001-0000065", [vigente], "d5", "d6")).toBeNull();
    expect(gtfEnUso("19-001-0000065", [vigente], "d5", "d9")).toBe(vigente);
  });
  it("el propio despacho, un anulado o un anexo no bloquean", () => {
    expect(gtfEnUso("19-001-0000065", [vigente], "d6")).toBeNull();
    expect(gtfEnUso("19-001-0000065", [{ ...vigente, fuente: "despacho_anulado" }], "d5")).toBeNull();
    expect(gtfEnUso("19-001-0000064", ANEXOS_BLAS, "d5")).toBeNull();
  });
});

describe("la Ficha guarda los dígitos", () => {
  it("valores fuera de rango o raros son «automático»", () => {
    expect(digitosGtfValidos(7)).toBe(7);
    expect(digitosGtfValidos("6")).toBe(6);
    expect(digitosGtfValidos(3)).toBeNull();
    expect(digitosGtfValidos(11)).toBeNull();
    expect(digitosGtfValidos(6.5)).toBeNull();
    expect(digitosGtfValidos(null)).toBeNull();
  });
  it("una ficha guardada antes (sin el campo) se lee igual, con dígitos automáticos", () => {
    expect(normalizeCtpFicha({ gtfSerie: "19-00000" }).gtfDigitos).toBeNull();
    expect(normalizeCtpFicha({ gtfSerie: "19-001", gtfDigitos: 7 }).gtfDigitos).toBe(7);
    expect(normalizeCtpFicha({ gtfSerie: "19-001", gtfDigitos: "x" }).gtfDigitos).toBeNull();
    expect(emptyCtpFicha().gtfDigitos).toBeNull();
  });
});

it("fuenteGtfTexto dice de dónde salió el último número", () => {
  expect(fuenteGtfTexto(ANEXOS_BLAS[0])).toBe("Anexo 04 N° 2-19-0480621 del 25/09");
  expect(fuenteGtfTexto(ANULADOS_BLAS[0])).toBe("despacho #1 (anulado) del 27/09");
});

describe("tipeos que corren el talonario", () => {
  it("más de 20 sobre la propuesta se pregunta; hasta 20 o para atrás, no", () => {
    const p = { correlativo: 65 };
    expect(saltoDeCorrelativo(650, p)).toBe(585);
    expect(saltoDeCorrelativo(86, p)).toBe(21);
    expect(saltoDeCorrelativo(85, p)).toBeNull();
    expect(saltoDeCorrelativo(59, p)).toBeNull();
  });
  it("la serie de la Ficha no admite tramos vacíos", () => {
    expect(serieGtfValida("19-001")).toBe(true);
    expect(serieGtfValida("GTF-001")).toBe(true);
    expect(serieGtfValida("")).toBe(true);
    expect(serieGtfValida("19--001")).toBe(false);
    expect(serieGtfValida("19-001-")).toBe(false);
    expect(serieGtfValida("-19-001")).toBe(false);
  });
});
