import { describe, it, expect } from "vitest";
import {
  smalianVolume,
  censusVolume,
  computeBalance,
  type BalanceSpeciesInput,
  type BalanceMovement,
} from "@/lib/forestal/loth-constants";

/**
 * Tests de la lógica forestal SERFOR (ADR-126). Fórmulas puras + balance.
 * Valores de referencia verificados contra la guía SERFOR y el flujo del árbol 85-TOR.
 */

describe("smalianVolume — cubicación de troza (0.7854·((Ømay+Ømen)/2)²·L)", () => {
  it("tronco 85-TOR (Ø 0.80/0.60, L 13) ≈ 5.0030 m³ (ejemplo guía SERFOR)", () => {
    expect(smalianVolume(0.8, 0.6, 13)).toBe(5.003);
  });
  it("troza cilíndrica Ø 0.96 × L 16 = 11.5812 m³", () => {
    expect(smalianVolume(0.96, 0.96, 16)).toBe(11.5812);
  });
  it("retorna 0 con medidas inválidas (cero o negativas)", () => {
    expect(smalianVolume(0, 0.6, 13)).toBe(0);
    expect(smalianVolume(0.8, 0, 13)).toBe(0);
    expect(smalianVolume(0.8, 0.6, 0)).toBe(0);
    expect(smalianVolume(-1, 0.6, 13)).toBe(0);
  });
  it("redondea a 4 decimales (estándar SERFOR)", () => {
    const v = smalianVolume(0.8, 0.78, 3); // 0.7854·0.79²·3
    expect(v).toBeCloseTo(1.4705, 4);
    expect(Number.isInteger(v * 10000)).toBe(true);
  });
});

describe("censusVolume — volumen comercial del árbol en pie (0.7854·DAP²·Hc·ff)", () => {
  it("Tornillo censo (DAP 0.80, Hc 13, ff 0.65) = 4.2474 m³", () => {
    expect(censusVolume(0.8, 13, 0.65)).toBe(4.2474);
  });
  it("Shihuahuaco censo (DAP 0.96, Hc 16, ff 0.65) = 7.5278 m³", () => {
    expect(censusVolume(0.96, 16, 0.65)).toBe(7.5278);
  });
  it("ff por defecto = 0.65", () => {
    expect(censusVolume(0.8, 13)).toBe(censusVolume(0.8, 13, 0.65));
  });
  it("retorna 0 con DAP o Hc inválidos", () => {
    expect(censusVolume(0, 16)).toBe(0);
    expect(censusVolume(0.8, 0)).toBe(0);
  });
});

describe("computeBalance — balance de extracción / saldos (operación 85-TOR)", () => {
  const species: BalanceSpeciesInput[] = [
    { speciesCommon: "Tornillo", cites: false, volumenAutorizadoM3: 80, precioVentaSoles: 450, valorEstadoNaturalSoles: 22.5 },
    { speciesCommon: "Shihuahuaco", cites: true, volumenAutorizadoM3: 60, precioVentaSoles: 950, valorEstadoNaturalSoles: 41 },
  ];
  const movements: BalanceMovement[] = [
    { section: "tala", speciesCommon: "Tornillo", trozaCode: null, volumeM3: 5.003, quantity: null, unit: null },
    { section: "trozado", speciesCommon: "Tornillo", trozaCode: "85-TOR-A", volumeM3: 1.471, quantity: null, unit: null },
    { section: "trozado", speciesCommon: "Tornillo", trozaCode: "85-TOR-B", volumeM3: 1.29, quantity: null, unit: null },
    { section: "despacho_troza", speciesCommon: null, trozaCode: "85-TOR-A", volumeM3: null, quantity: null, unit: null },
    { section: "despacho_troza", speciesCommon: null, trozaCode: "85-TOR-B", volumeM3: null, quantity: null, unit: null },
    { section: "despacho_producto", speciesCommon: "Tornillo", trozaCode: null, volumeM3: null, quantity: 1.9, unit: "m3" },
  ];

  const r = computeBalance(species, movements, { uitRef: 5350, areaHa: 1200 });
  const tornillo = r.rows.find((x) => x.species === "Tornillo")!;
  const shi = r.rows.find((x) => x.species === "Shihuahuaco")!;

  it("movilizado de Tornillo = trozas despachadas (A+B) + producto (1.9) = 4.661 m³", () => {
    expect(tornillo.movilizado).toBeCloseTo(4.661, 3);
  });
  it("saldo = autorizado − movilizado", () => {
    expect(tornillo.saldo).toBeCloseTo(75.339, 3);
  });
  it("valor movilizado = movilizado × precio/m³", () => {
    expect(tornillo.valorMovilizado).toBeCloseTo(2097.45, 2);
  });
  it("pago derecho especie = movilizado × VEN/m³", () => {
    expect(tornillo.pagoDerecho).toBeCloseTo(104.87, 2);
  });
  it("especie sin movimientos: saldo = autorizado, sin valor", () => {
    expect(shi.movilizado).toBe(0);
    expect(shi.saldo).toBe(60);
    expect(shi.valorMovilizado).toBe(0);
  });
  it("pago por área = 0.01% UIT × ha", () => {
    expect(r.pagoArea).toBe(642); // 0.0001 × 5350 × 1200
  });
  it("pago derecho total = pago área + Σ pago derecho especies", () => {
    expect(r.pagoDerechoTotal).toBeCloseTo(746.87, 2);
  });
  it("no marca exceso cuando movilizado < autorizado", () => {
    expect(tornillo.exceso).toBe(false);
  });
  it("marca EXCESO cuando lo movilizado supera lo autorizado (causa de sanción OSINFOR)", () => {
    const exceso = computeBalance(
      [{ speciesCommon: "Caoba", cites: true, volumenAutorizadoM3: 2, precioVentaSoles: 1200, valorEstadoNaturalSoles: 60 }],
      [
        { section: "trozado", speciesCommon: "Caoba", trozaCode: "1-CAO-A", volumeM3: 3, quantity: null, unit: null },
        { section: "despacho_troza", speciesCommon: null, trozaCode: "1-CAO-A", volumeM3: null, quantity: null, unit: null },
      ],
      {},
    );
    expect(exceso.rows[0].exceso).toBe(true);
    expect(exceso.rows[0].saldo).toBeLessThan(0);
  });
});
