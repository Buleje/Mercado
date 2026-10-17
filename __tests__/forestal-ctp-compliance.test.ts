/**
 * Libro CTP · cumplimiento SERFOR — tests puros (sin DB).
 *
 * Cubren las dos decisiones que hacen que el score signifique algo:
 *  1. `estaFueraDePlazo` debe coincidir EXACTO con el SQL de `stats().lateCount`.
 *     Si divergen, el panel dice "1 fuera de plazo" y la tabla no marca ninguna
 *     fila: el mismo módulo contradiciéndose frente a un fiscalizador.
 *  2. CITES NO resta puntos. Tener madera CITES es legal (con permiso), no una
 *     infracción; si restara, un aserradero en regla quedaría clavado bajo 100
 *     sin ninguna acción posible, y un score incorregible enseña a ignorarlo.
 */

import { describe, it, expect } from "vitest";
import {
  PLAZO_REGISTRO_DIAS,
  diasDeRegistro,
  diasHabilesDeRegistro,
  estaFueraDePlazo,
  ctpComplianceScore,
  ctpComplianceTone,
  type CtpComplianceCounts,
} from "@/lib/forestal/ctp-compliance";

// 2026-06-01 es LUNES (getUTCDay=1); 2026-06-05 es VIERNES. Fechas ancla para
// razonar días hábiles sin ambigüedad.
const LUNES = new Date("2026-06-01T00:00:00.000Z");
const VIERNES = new Date("2026-06-05T00:00:00.000Z");
/** Ingreso operado en `base` y registrado `dias` calendario después. */
const registrado = (base: Date, dias: number) => ({
  entryDate: base,
  createdAt: new Date(base.getTime() + dias * 86_400_000),
});

const sinAlertas: CtpComplianceCounts = {
  fueraPlazo: 0,
  pendientes: 0,
  citesCount: 0,
  especiesEnNegativo: 0,
  stockNegativo: 0,
  despachosSinTraza: 0,
};

describe("estaFueraDePlazo — 2 días HÁBILES (RDE D000025-2023), espejo del SQL de stats().lateCount", () => {
  it("las fechas ancla son lunes y viernes (sanity)", () => {
    expect(LUNES.getUTCDay()).toBe(1);
    expect(VIERNES.getUTCDay()).toBe(5);
  });

  it("lunes → registrado lunes (0 hábiles) NO está fuera", () => {
    expect(diasHabilesDeRegistro(registrado(LUNES, 0))).toBe(0);
    expect(estaFueraDePlazo(registrado(LUNES, 0))).toBe(false);
  });

  it("lunes → miércoles (2 hábiles) NO está fuera; jueves (3 hábiles) SÍ", () => {
    expect(diasHabilesDeRegistro(registrado(LUNES, 2))).toBe(2); // mar, mié
    expect(estaFueraDePlazo(registrado(LUNES, 2))).toBe(false);
    expect(diasHabilesDeRegistro(registrado(LUNES, 3))).toBe(3); // + jue
    expect(estaFueraDePlazo(registrado(LUNES, 3))).toBe(true);
  });

  it("el fin de semana NO cuenta: viernes → martes siguiente son 2 hábiles (no 4)", () => {
    // vie +3 = lun (1 hábil), +4 = mar (2), +5 = mié (3 → fuera)
    expect(diasHabilesDeRegistro(registrado(VIERNES, 3))).toBe(1);
    expect(diasHabilesDeRegistro(registrado(VIERNES, 4))).toBe(2);
    expect(estaFueraDePlazo(registrado(VIERNES, 4))).toBe(false);
    expect(diasHabilesDeRegistro(registrado(VIERNES, 5))).toBe(3);
    expect(estaFueraDePlazo(registrado(VIERNES, 5))).toBe(true);
  });

  it("una semana entera = 5 hábiles (está fuera)", () => {
    expect(diasHabilesDeRegistro(registrado(LUNES, 7))).toBe(5);
    expect(estaFueraDePlazo(registrado(LUNES, 7))).toBe(true);
  });

  it("el número que se MUESTRA sigue siendo días calendario (floored)", () => {
    expect(diasDeRegistro(registrado(LUNES, 3))).toBe(3);
  });

  it("fechas inválidas no marcan falsos positivos", () => {
    expect(estaFueraDePlazo({ entryDate: "no-es-fecha", createdAt: "tampoco" })).toBe(false);
    expect(diasHabilesDeRegistro({ entryDate: "no-es-fecha", createdAt: "tampoco" })).toBe(0);
  });

  it("un registro anterior a la operación no da días negativos ni fuera de plazo", () => {
    expect(diasHabilesDeRegistro(registrado(LUNES, -2))).toBe(0);
    expect(estaFueraDePlazo(registrado(LUNES, -2))).toBe(false);
  });
});

describe("ctpComplianceScore", () => {
  it("sin alertas = 100", () => {
    expect(ctpComplianceScore(sinAlertas)).toBe(100);
  });

  /** La razón del fix: CITES es un hecho legal, no una falta. */
  it("CITES NO resta: un aserradero en regla con shihuahuaco sigue en 100", () => {
    expect(ctpComplianceScore({ ...sinAlertas, citesCount: 7 })).toBe(100);
  });

  /** Los informativos de la Ficha avisan, no castigan: un documento que vence
   *  en 20 días todavía está vigente y el operador ya está haciendo lo correcto. */
  it("documentos vencidos o por vencer NO restan: son señales, no faltas del período", () => {
    expect(ctpComplianceScore({ ...sinAlertas, documentosPorVencer: 3 })).toBe(100);
    expect(ctpComplianceScore({ ...sinAlertas, documentosVencidos: 2 })).toBe(100);
  });

  /** ADR-135: desde que existe "Editar atribución" (CtpAtribucionEditor) el
   *  hueco es corregible sin anular y recrear ⇒ resta como las demás. */
  it("despachosSinTraza resta 5 por caso con tope 25: la cadena abierta al cierre es corregible", () => {
    expect(ctpComplianceScore({ ...sinAlertas, despachosSinTraza: 4 })).toBe(80);
    expect(ctpComplianceScore({ ...sinAlertas, despachosSinTraza: 50 })).toBe(75);
  });

  it("cada categoría corregible resta 5 por caso, con tope de 25", () => {
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 1 })).toBe(95);
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 5 })).toBe(75);
    // Tope: a partir del 5º caso la categoría ya está roja, 50 no es peor que 5.
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 50 })).toBe(75);
  });

  it("las 5 categorías corregibles al tope dan 0, nunca negativo", () => {
    expect(
      ctpComplianceScore({
        fueraPlazo: 99,
        pendientes: 99,
        citesCount: 99,
        especiesEnNegativo: 99,
        stockNegativo: 99,
        despachosSinTraza: 99,
      }),
    ).toBe(0);
  });

  it("ignora contadores negativos en vez de regalar puntos", () => {
    expect(ctpComplianceScore({ ...sinAlertas, pendientes: -5 })).toBe(100);
  });
});

describe("ctpComplianceTone", () => {
  it("mapea el score a un tono del DS", () => {
    expect(ctpComplianceTone(100)).toBe("success");
    expect(ctpComplianceTone(90)).toBe("success");
    expect(ctpComplianceTone(89)).toBe("warning");
    expect(ctpComplianceTone(70)).toBe("warning");
    expect(ctpComplianceTone(69)).toBe("error");
    expect(ctpComplianceTone(0)).toBe("error");
  });
});
