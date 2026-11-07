import { describe, expect, it } from "vitest";
import {
  ajustarLinea,
  conceptoDelPeriodo,
  proponerDescuentos,
  totalPorMoneda,
  type AdelantoDePlanilla,
} from "@/lib/adelantos/planilla-lote";

/**
 * Esto descuenta del sueldo de alguien. Lo que se protege: que no descuente de
 * más, que no toque adelantos que no son de planilla, y que el total no mezcle
 * monedas.
 */
const adelanto = (o: Partial<AdelantoDePlanilla> = {}): AdelantoDePlanilla => ({
  id: "a1",
  codigoOperacion: "ADL-2026-0001",
  modalidad: "DESCUENTO_PLANILLA",
  status: "ABIERTO",
  saldoPendiente: 300,
  moneda: "PEN",
  beneficiario: { nombre: "Ana" },
  ...o,
});

describe("qué entra en el lote", () => {
  it("sólo los de planilla, abiertos y con saldo", () => {
    const lineas = proponerDescuentos([
      adelanto({ id: "si" }),
      adelanto({ id: "otra-modalidad", modalidad: "CUENTA_CORRIENTE" }),
      adelanto({ id: "cerrado", status: "LIQUIDADO" }),
      adelanto({ id: "sin-saldo", saldoPendiente: 0 }),
    ]);
    expect(lineas.map((l) => l.adelantoId)).toEqual(["si"]);
  });

  it("sin tope propone el saldo completo y marca que liquida", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })]);
    expect(l.descuento).toBe(300);
    expect(l.liquida).toBe(true);
  });

  it("con tope propone el tope, y entonces NO liquida", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })], 100);
    expect(l.descuento).toBe(100);
    expect(l.liquida).toBe(false);
  });

  /**
   * Descontar más de lo que debe convertiría el adelanto en un saldo a favor de
   * la persona: otro problema, y peor.
   */
  it("el tope nunca hace descontar más de lo que se debe", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 50 })], 500);
    expect(l.descuento).toBe(50);
  });

  it("ordena por nombre: la lista se revisa persona por persona", () => {
    const lineas = proponerDescuentos([
      adelanto({ id: "z", beneficiario: { nombre: "Zoe" } }),
      adelanto({ id: "a", beneficiario: { nombre: "Ana" } }),
    ]);
    expect(lineas.map((l) => l.persona)).toEqual(["Ana", "Zoe"]);
  });
});

describe("ajustar antes de aplicar", () => {
  it("no deja pasarse del saldo", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })]);
    expect(ajustarLinea(l, 999).descuento).toBe(300);
  });

  it("ni irse a negativo", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })]);
    expect(ajustarLinea(l, -50).descuento).toBe(0);
  });

  it("bajar el monto desmarca que liquida", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })]);
    expect(l.liquida).toBe(true);
    expect(ajustarLinea(l, 100).liquida).toBe(false);
  });

  it("poner 0 saca la línea del total sin borrarla de la lista", () => {
    const [l] = proponerDescuentos([adelanto({ saldoPendiente: 300 })]);
    expect(totalPorMoneda([ajustarLinea(l, 0)])).toEqual({});
  });
});

describe("el total", () => {
  /** Sumar soles con dólares da un número que no significa nada. */
  it("no mezcla monedas", () => {
    const lineas = proponerDescuentos([
      adelanto({ id: "s", saldoPendiente: 100, moneda: "PEN" }),
      adelanto({ id: "d", saldoPendiente: 40, moneda: "USD", beneficiario: { nombre: "Beto" } }),
    ]);
    expect(totalPorMoneda(lineas)).toEqual({ PEN: 100, USD: 40 });
  });

  it("el concepto nombra el período, para poder auditarlo después", () => {
    expect(conceptoDelPeriodo("agosto 2026")).toBe("Descuento por planilla · agosto 2026");
  });
});
