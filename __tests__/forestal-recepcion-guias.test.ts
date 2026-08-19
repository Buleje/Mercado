import { describe, expect, it } from "vitest";
import {
  estaRecepcionada,
  estadoRecepcion,
  faltaParaRecepcionar,
  piezasDecididas,
  resumenRecepcion,
} from "@/lib/forestal/recepcion-guias";

/**
 * La bandeja de guías por recepcionar (ADR-339).
 *
 * El criterio decide qué ve el operador al abrir el módulo, así que se prueba
 * con los casos que existen de verdad en el libro: la guía vieja importada sin
 * fecha, la validada a mano, la que trae su lista de piezas resuelta y la que
 * llegó a medias.
 */

describe("cuándo una guía está recepcionada", () => {
  it("validarla alcanza", () => {
    expect(estaRecepcionada({ status: "validado" })).toBe(true);
  });

  it("fecharla alcanza, aunque siga pendiente de validar", () => {
    expect(estaRecepcionada({ status: "pendiente", fechaRecepcion: "2026-08-05" })).toBe(true);
  });

  it("tener todas las piezas decididas alcanza", () => {
    expect(estaRecepcionada({ status: "pendiente", trozasCount: 30, trozasDecididas: 30 })).toBe(true);
  });

  it("una guía a medias sigue en la bandeja", () => {
    const g = { status: "pendiente", trozasCount: 30, trozasDecididas: 28 };
    expect(estaRecepcionada(g)).toBe(false);
    expect(estadoRecepcion(g)).toBe("por-recepcionar");
  });

  it("sin lista de piezas, no se puede cerrar por piezas", () => {
    expect(piezasDecididas({ trozasCount: 0, trozasDecididas: 0 })).toBe(false);
    expect(estaRecepcionada({ status: "pendiente" })).toBe(false);
  });

  it("no cuenta de más si hubiera más decididas que declaradas", () => {
    expect(piezasDecididas({ trozasCount: 2, trozasDecididas: 5 })).toBe(true);
  });
});

describe("qué le falta a la guía", () => {
  it("lo dice en palabras del patio, no como error", () => {
    expect(faltaParaRecepcionar({ status: "pendiente", trozasCount: 30, trozasDecididas: 27 })).toEqual([
      "sin validar",
      "sin fecha de recepción",
      "3 piezas sin decidir",
    ]);
  });

  it("una sola pieza se dice en singular", () => {
    const falta = faltaParaRecepcionar({ status: "pendiente", trozasCount: 4, trozasDecididas: 3 });
    expect(falta).toContain("1 pieza sin decidir");
  });

  it("una guía ya recepcionada no pide nada", () => {
    expect(faltaParaRecepcionar({ status: "validado" })).toEqual([]);
  });
});

describe("resumen de la bandeja", () => {
  it("separa lo ingresado de lo pendiente y cuenta las piezas disponibles", () => {
    const r = resumenRecepcion([
      { status: "validado", trozasCount: 30, trozasDecididas: 30 },
      { status: "pendiente", fechaRecepcion: "2026-08-05", trozasCount: 12, trozasDecididas: 0 },
      { status: "pendiente", trozasCount: 5, trozasDecididas: 1 },
      { status: "pendiente" },
    ]);
    expect(r).toEqual({ total: 4, ingresadas: 2, porRecepcionar: 2, piezasDisponibles: 42 });
  });

  it("sin guías, todo en cero", () => {
    expect(resumenRecepcion([])).toEqual({ total: 0, ingresadas: 0, porRecepcionar: 0, piezasDisponibles: 0 });
  });
});
