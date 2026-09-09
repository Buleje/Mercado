/**
 * La matriz de lo que la sierra puede hacer (ADR-407).
 *
 * Lo que se protege acá es la regla que Brandon dictó el 2026-09-09: de
 * comercial sale paquetería, larga angosta y corta; de paquetería larga sale
 * paquetería corta; **nada vuelve a comercial ni a tabla**. Una conversión de
 * más no es una sugerencia de más: es una transformación imposible declarada
 * ante SERFOR.
 */

import { describe, expect, it } from "vitest";
import {
  FRASE_REGLA,
  porQueNoSePuede,
  puedeReprocesarse,
  salidasDeReproceso,
  SALIDAS_DE_REPROCESO,
} from "@/lib/forestal/reproceso-reglas";
import { ORDEN_TIPO } from "@/lib/forestal/cubicacion-tipo";

describe("lo que SÍ se puede", () => {
  it.each([
    ["Comercial", "Paquetería larga"],
    ["Comercial", "Paquetería corta"],
    ["Comercial", "Larga angosta"],
    ["Comercial", "Corta"],
    ["Paquetería larga", "Paquetería corta"],
  ])("de %s sale %s", (desde, hacia) => {
    expect(puedeReprocesarse(desde, hacia)).toBe(true);
    expect(porQueNoSePuede(desde, hacia)).toBeNull();
  });
});

describe("lo que NO se puede", () => {
  it.each([
    ["Paquetería larga", "Comercial"],
    ["Paquetería corta", "Comercial"],
    ["Tabla", "Comercial"],
    ["Corta", "Comercial"],
    ["Larga angosta", "Comercial"],
    ["Paquetería larga", "Corta"],
    ["Paquetería larga", "Tabla"],
    ["Paquetería corta", "Corta"],
    ["Paquetería corta", "Paquetería larga"],
    ["Comercial", "Otro"],
  ])("de %s no sale %s", (desde, hacia) => {
    expect(puedeReprocesarse(desde, hacia)).toBe(false);
    /* Y siempre dice POR QUÉ: una fila que desaparece sin explicación se lee
       como un bug del sistema, no como una regla del aserradero. */
    expect(porQueNoSePuede(desde, hacia)).toBeTruthy();
  });

  it("ningún tipo vuelve a comercial: la sierra recorta, no agranda", () => {
    for (const t of ORDEN_TIPO) {
      expect(puedeReprocesarse(t, "Comercial")).toBe(false);
    }
  });

  it("nadie produce tabla por reproceso", () => {
    for (const t of ORDEN_TIPO) {
      expect(puedeReprocesarse(t, "Tabla")).toBe(false);
    }
  });
});

describe("bordes", () => {
  it("un tipo hacia sí mismo no es reproceso", () => {
    for (const t of ORDEN_TIPO) expect(puedeReprocesarse(t, t)).toBe(false);
    expect(porQueNoSePuede("Comercial", "Comercial")).toMatch(/mismo tipo/i);
  });

  it("no depende de tildes ni de mayúsculas", () => {
    expect(puedeReprocesarse("PAQUETERIA LARGA", "paquetería corta")).toBe(true);
    expect(puedeReprocesarse("comercial", "LARGA ANGOSTA")).toBe(true);
  });

  it("un tipo desconocido o vacío no habilita nada: no se adivina", () => {
    expect(puedeReprocesarse("Machimbre", "Comercial")).toBe(false);
    expect(puedeReprocesarse("", "Corta")).toBe(false);
    expect(puedeReprocesarse("Comercial", null)).toBe(false);
    expect(salidasDeReproceso("Machimbre")).toEqual([]);
  });

  it("la matriz cubre todos los tipos del catálogo: ninguno queda sin regla", () => {
    for (const t of ORDEN_TIPO) {
      const k = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      expect(Object.keys(SALIDAS_DE_REPROCESO)).toContain(k);
    }
  });

  it("ninguna salida declarada apunta a un tipo que no existe", () => {
    for (const salidas of Object.values(SALIDAS_DE_REPROCESO)) {
      for (const s of salidas) expect(ORDEN_TIPO).toContain(s);
    }
  });
});

describe("la frase que se muestra sale del mapa, no de la mano", () => {
  it("nombra las conversiones vivas y ninguna muerta", () => {
    expect(FRASE_REGLA).toContain("paquetería larga");
    expect(FRASE_REGLA).toContain("larga angosta");
    expect(FRASE_REGLA).toMatch(/no agranda/);
    /* Los tipos sin salidas no aparecen como origen. */
    expect(FRASE_REGLA).not.toMatch(/de tabla sale/i);
  });
});
