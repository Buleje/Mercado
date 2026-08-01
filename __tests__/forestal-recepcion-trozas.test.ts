import { describe, it, expect } from "vitest";
import {
  avisosRecepcion,
  balanceRecepcion,
  type TrozaRecepcion,
} from "@/lib/forestal/recepcion-trozas";

/**
 * ADR-325 — recibir no es lo mismo que la guía.
 *
 * La GTF declara 25 trozas y al patio llegan 23. Antes el libro sólo sabía lo
 * que decía el documento, así que dos trozas que nunca llegaron figuraban como
 * existencia — y una existencia que no existe es lo que un fiscalizador
 * encuentra al contar la pila.
 */

const troza = (over: Partial<TrozaRecepcion> = {}): TrozaRecepcion => ({
  id: "t1",
  codificacion: "52/A",
  volumenM3: 3,
  noRecepcionada: false,
  ...over,
});

describe("balance de la recepción", () => {
  it("separa lo declarado de lo que llegó", () => {
    const b = balanceRecepcion([
      troza({ id: "a", volumenM3: 3 }),
      troza({ id: "b", volumenM3: 2 }),
      troza({ id: "c", volumenM3: 1.5, noRecepcionada: true }),
    ]);
    expect(b.declaradas).toBe(3);
    expect(b.recibidas).toBe(2);
    expect(b.faltantes).toBe(1);
    expect(b.volumenDeclarado).toBe(6.5);
    expect(b.volumenRecibido).toBe(5);
    expect(b.brechaM3).toBe(1.5);
    expect(b.completa).toBe(false);
  });

  it("todo recibido = recepción completa", () => {
    const b = balanceRecepcion([troza({ id: "a" }), troza({ id: "b" })]);
    expect(b.completa).toBe(true);
    expect(b.faltantes).toBe(0);
    expect(b.brechaM3).toBe(0);
  });

  it("una guía sin trozas no está 'completa': no hay nada que recibir", () => {
    expect(balanceRecepcion([]).completa).toBe(false);
  });

  it("los retrozos NO se cuentan: son la misma madera de su madre", () => {
    const b = balanceRecepcion([
      troza({ id: "madre", volumenM3: 3.268 }),
      troza({ id: "p1", volumenM3: 1.82, trozaOrigenId: "madre" }),
      troza({ id: "p2", volumenM3: 1.32, trozaOrigenId: "madre" }),
    ]);
    expect(b.declaradas).toBe(1);
    expect(b.volumenRecibido).toBe(3.268);
  });

  it("cuenta cuántas tienen su código de planta y su parcela", () => {
    const b = balanceRecepcion([
      troza({ id: "a", codigoPlanta: "118", parcela: "PC-03" }),
      troza({ id: "b", codigoPlanta: "  " }),
      troza({ id: "c" }),
    ]);
    expect(b.conCodigoPlanta).toBe(1);
    expect(b.conParcela).toBe(1);
  });
});

describe("avisos de la recepción", () => {
  it("avisa lo que no llegó, con el volumen", () => {
    const b = balanceRecepcion([troza({ id: "a", volumenM3: 3 }), troza({ id: "b", volumenM3: 2, noRecepcionada: true })]);
    const avisos = avisosRecepcion(b, 3);
    expect(avisos.join(" ")).toMatch(/1 de 2 troza/);
    expect(avisos.join(" ")).toMatch(/2\.0000 m³ menos/);
  });

  it("avisa cuando el ingreso quedó con un volumen distinto del recibido", () => {
    const b = balanceRecepcion([troza({ id: "a", volumenM3: 3, codigoPlanta: "1", parcela: "PC-1" })]);
    // El ingreso está registrado con 5 m³ pero sólo llegaron 3.
    expect(avisosRecepcion(b, 5).join(" ")).toMatch(/Corregí el volumen del ingreso/);
  });

  it("con todo cuadrado y completo, no hay avisos", () => {
    const b = balanceRecepcion([troza({ id: "a", volumenM3: 3, codigoPlanta: "118", parcela: "PC-03" })]);
    expect(avisosRecepcion(b, 3)).toEqual([]);
  });

  it("pide el código de planta y la parcela porque son el cruce con el patio y el POA", () => {
    const b = balanceRecepcion([troza({ id: "a", volumenM3: 3 })]);
    const avisos = avisosRecepcion(b, 3).join(" ");
    expect(avisos).toMatch(/sin código de planta/);
    expect(avisos).toMatch(/sin parcela de corta/);
    expect(avisos).toMatch(/OSINFOR/);
  });

  it("sin trozas no inventa avisos", () => {
    expect(avisosRecepcion(balanceRecepcion([]), 10)).toEqual([]);
  });
});
