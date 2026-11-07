/**
 * SUNAT: la boleta de más de S/ 700 lleva el DNI del cliente (Reglamento de
 * Comprobantes de Pago, art. 8, num. 3.10). Hasta 700, ni facturas ni tickets: nada cambia.
 */
import { describe, expect, it } from "vitest";
import { AVISO_DNI_BOLETA, boletaPideDni, esDni, faltaDniEnBoleta } from "@/lib/sunat/boleta-dni";

describe("DNI en boletas de más de S/ 700", () => {
  it("sólo la boleta y sólo pasando los S/ 700 (en céntimos)", () => {
    expect(boletaPideDni("boleta", 700.01)).toBe(true);
    expect(boletaPideDni("boleta", 1250)).toBe(true);
    expect(boletaPideDni("boleta", 700)).toBe(false);
    expect(boletaPideDni("boleta", 700.004)).toBe(false);
    expect(boletaPideDni("boleta", 120)).toBe(false);
    expect(boletaPideDni("factura", 5000)).toBe(false);
    expect(boletaPideDni("ticket", 5000)).toBe(false);
    expect(boletaPideDni(undefined, 5000)).toBe(false);
  });

  it("el DNI son 8 dígitos", () => {
    expect(esDni("45678912")).toBe(true);
    expect(esDni(" 45678912 ")).toBe(true);
    expect(esDni("4567891")).toBe(false);
    expect(esDni("20100070970")).toBe(false);
    expect(esDni("")).toBe(false);
    expect(esDni(null)).toBe(false);
  });

  it("falta = el aviso; con DNI o por debajo del tope, nada", () => {
    expect(faltaDniEnBoleta("boleta", 850, "")).toBe(AVISO_DNI_BOLETA);
    expect(faltaDniEnBoleta("boleta", 850, "1234")).toBe(AVISO_DNI_BOLETA);
    expect(faltaDniEnBoleta("boleta", 850, "45678912")).toBeNull();
    expect(faltaDniEnBoleta("boleta", 699.9, "")).toBeNull();
    expect(faltaDniEnBoleta("factura", 850, "")).toBeNull();
  });
});
