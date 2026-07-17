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
  estaFueraDePlazo,
  ctpComplianceScore,
  ctpComplianceTone,
  type CtpComplianceCounts,
} from "@/lib/forestal/ctp-compliance";

const BASE = new Date("2026-05-01T00:00:00.000Z");
/** Ingreso registrado `horas` después de la operación. */
const conRetraso = (horas: number) => ({
  entryDate: BASE,
  createdAt: new Date(BASE.getTime() + horas * 3_600_000),
});

const sinAlertas: CtpComplianceCounts = {
  fueraPlazo: 0,
  pendientes: 0,
  citesCount: 0,
  especiesEnNegativo: 0,
  stockNegativo: 0,
  despachosSinTraza: 0,
};

describe("estaFueraDePlazo — debe espejar el SQL: (createdAt - entryDate) > 15 days", () => {
  it("justo en el plazo (15.0 días) NO está fuera", () => {
    expect(estaFueraDePlazo(conRetraso(PLAZO_REGISTRO_DIAS * 24))).toBe(false);
  });

  /** REGRESIÓN: con `diasDeRegistro(e) > 15` el floor daba `15 > 15` = false ⇒ el
   *  badge de la tabla decía "en plazo" mientras el panel lo contaba como tarde. */
  it("15 días + 1 hora SÍ está fuera (el floor decía que no — ese era el bug)", () => {
    expect(estaFueraDePlazo(conRetraso(PLAZO_REGISTRO_DIAS * 24 + 1))).toBe(true);
  });

  it("15.5 días está fuera, aunque se muestre como '15d'", () => {
    const e = conRetraso(15.5 * 24);
    expect(estaFueraDePlazo(e)).toBe(true);
    expect(diasDeRegistro(e)).toBe(15); // el número que se muestra va floored, para humanos
  });

  it("16 días está fuera y 3 días no", () => {
    expect(estaFueraDePlazo(conRetraso(16 * 24))).toBe(true);
    expect(estaFueraDePlazo(conRetraso(3 * 24))).toBe(false);
  });

  it("fechas inválidas no marcan falsos positivos", () => {
    expect(estaFueraDePlazo({ entryDate: "no-es-fecha", createdAt: "tampoco" })).toBe(false);
    expect(diasDeRegistro({ entryDate: "no-es-fecha", createdAt: "tampoco" })).toBe(0);
  });

  it("un registro anterior a la operación no da días negativos", () => {
    expect(diasDeRegistro(conRetraso(-48))).toBe(0);
    expect(estaFueraDePlazo(conRetraso(-48))).toBe(false);
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

  /** ADR-135: el libro admite huecos por diseño y aún no hay UI para completar
   *  la atribución post-alta — el gate real es que el certificado no se emite.
   *  Cuando exista "editar atribución", promover a CATEGORIAS_QUE_RESTAN. */
  it("despachosSinTraza NO resta (informativo): el certificado ya es el gate", () => {
    expect(ctpComplianceScore({ ...sinAlertas, despachosSinTraza: 4 })).toBe(100);
  });

  it("cada categoría corregible resta 5 por caso, con tope de 25", () => {
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 1 })).toBe(95);
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 5 })).toBe(75);
    // Tope: a partir del 5º caso la categoría ya está roja, 50 no es peor que 5.
    expect(ctpComplianceScore({ ...sinAlertas, fueraPlazo: 50 })).toBe(75);
  });

  it("las 4 categorías corregibles al tope dan 0, nunca negativo", () => {
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
