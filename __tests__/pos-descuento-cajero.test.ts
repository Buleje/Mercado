/**
 * Tope de descuento del cajero desde Ajustes (lib/pos/descuento-cajero.ts).
 *
 * `Settings.maxDiscountPercent` nace con `@default(100)` en los 14 negocios
 * (medido 09-10): leerlo tal cual le abría el 100 % a todos los cajeros. Por
 * eso 100 o vacío = 15 de fábrica, y la pantalla guarda de 0 a 99.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  excedeTopeCajero,
  excedeTopeItemCajero,
  pctLegible,
  TOPE_DESCUENTO_CAJERO_PCT,
  topeCajeroParaGuardar,
  topeCajeroPct,
  topeDescuentoCajero,
  topeDescuentoCajeroCentimos,
} from "@/lib/pos/descuento-cajero";
import { calcularTrueque, frenaPorRol } from "@/lib/pos/trueque";

describe("topeCajeroPct: lo guardado en Ajustes → % del cajero", () => {
  it("sin valor elegido rige el 15 de fábrica (incluido el 100 que pone la columna)", () => {
    for (const v of [undefined, null, "", "  ", "abc", Number.NaN, Infinity, 100, 150, 99.995, {}]) {
      expect(topeCajeroPct(v)).toBe(TOPE_DESCUENTO_CAJERO_PCT);
    }
  });

  it("respeta lo elegido entre 0 y 99,99 con 2 decimales", () => {
    expect(topeCajeroPct(10)).toBe(10);
    expect(topeCajeroPct("12.5")).toBe(12.5);
    expect(topeCajeroPct(99)).toBe(99);
    expect(topeCajeroPct(0)).toBe(0);
    expect(topeCajeroPct(-5)).toBe(0);
    expect(topeCajeroPct(7.126)).toBe(7.13);
  });

  it("la pantalla guarda de 0 a 99 (nunca el 100 que se leería como 15)", () => {
    expect(topeCajeroParaGuardar(100)).toBe(99);
    expect(topeCajeroParaGuardar(-3)).toBe(0);
    expect(topeCajeroParaGuardar(Number.NaN)).toBe(15);
    expect(topeCajeroParaGuardar(12.5)).toBe(12.5);
    expect(topeCajeroPct(topeCajeroParaGuardar(100))).toBe(99);
  });
});

describe("tope global con el % de Ajustes, en céntimos", () => {
  // Para cada % la cuenta exacta en enteros: ⌊c × centésimas / 10 000⌋.
  for (const [pct, centesimas] of [[10, 1000], [12.5, 1250], [5, 500], [33, 3300]] as const) {
    it(`${pct} %: de S/ 0,01 a S/ 1 000,00 el tope se acepta y un céntimo más no`, () => {
      const desfases: number[] = [];
      for (let c = 1; c <= 100_000; c++) {
        const total = c / 100;
        const tope = topeDescuentoCajero(total, pct);
        if (
          topeDescuentoCajeroCentimos(total, pct) !== Math.floor((c * centesimas) / 10_000)
          || excedeTopeCajero(tope, total, pct)
          || !excedeTopeCajero(tope + 0.01, total, pct)
          || calcularTrueque(total, tope, pct).pasaTopeCajero
        ) {
          desfases.push(total);
        }
      }
      expect(desfases).toEqual([]);
    });
  }

  it("sin % explícito sigue siendo el 15 de siempre", () => {
    expect(topeDescuentoCajero(9)).toBe(1.35);
    expect(topeDescuentoCajero(9, 15)).toBe(1.35);
    expect(topeDescuentoCajero(40, 10)).toBe(4);
  });

  it("0 %: el cajero no descuenta nada; el % fuera de rango se acota", () => {
    expect(topeDescuentoCajero(100, 0)).toBe(0);
    expect(excedeTopeCajero(0.01, 100, 0)).toBe(true);
    expect(excedeTopeCajero(0, 100, 0)).toBe(false);
    expect(topeDescuentoCajero(10, 250)).toBe(10);
    expect(topeDescuentoCajero(10, -4)).toBe(0);
  });

  it("el trueque frena al cajero con el % de Ajustes y no al dueño", () => {
    const calc = calcularTrueque(50, 6, 10); // tope S/ 5,00
    expect(calc.topeCajero).toBe(5);
    expect(calc.topeCajeroPct).toBe(10);
    expect(frenaPorRol(calc, "cajero")).toBe(true);
    expect(frenaPorRol(calc, "owner")).toBe(false);
    expect(frenaPorRol(calcularTrueque(50, 5, 10), "cajero")).toBe(false);
  });
});

describe("tope por producto (%)", () => {
  it("compara centésima contra centésima", () => {
    expect(excedeTopeItemCajero(15, 15)).toBe(false);
    expect(excedeTopeItemCajero(15.004, 15)).toBe(false);
    expect(excedeTopeItemCajero(15.01, 15)).toBe(true);
    expect(excedeTopeItemCajero(10, 5)).toBe(true);
    expect(excedeTopeItemCajero(0, 0)).toBe(false);
    expect(excedeTopeItemCajero(Number.NaN, 5)).toBe(false);
  });

  it("el % se muestra sin Intl", () => {
    expect(pctLegible(15)).toBe("15");
    expect(pctLegible(12.5)).toBe("12.5");
  });
});

describe("guardián: Ajustes guarda y valida el campo que lee la ruta", () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

  it("PUT /api/settings valida 0-100 con safeParse antes de guardar", () => {
    const ruta = leer("app/api/settings/route.ts");
    expect(ruta).toMatch(/TOPE_CAJERO_SCHEMA = z\.number\(\)\.min\(0\)\.max\(100\)\.nullable\(\)/);
    expect(ruta).toMatch(/TOPE_CAJERO_SCHEMA\.safeParse\(body\.maxDiscountPercent\)/);
  });

  it("la sección Cobros manda el campo con topeCajeroParaGuardar", () => {
    expect(leer("components/admin/settings/SeccionCobros.tsx")).toMatch(
      /maxDiscountPercent: topeCajeroParaGuardar\(maxDiscountPercent\)/,
    );
  });
});
