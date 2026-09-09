/**
 * La matriz de lo que la sierra puede hacer (ADR-407).
 *
 * La regla, como Brandon la dejó el 2026-09-09 después de corregirse: los dos
 * productos de sección plena —**comercial** y **paquetería**— son origen de
 * cualquier otro tipo; **tabla, larga angosta y corta no son origen de nada**,
 * ya son producto terminado. Ofrecer un origen que no puede dar el destino es
 * hacer declarar ante SERFOR una transformación que la máquina no hace.
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
    ["Comercial", "Tabla"],
    ["Comercial", "Larga angosta"],
    ["Comercial", "Corta"],
    ["Paquetería larga", "Paquetería corta"],
    ["Paquetería larga", "Comercial"],
    ["Paquetería larga", "Tabla"],
    ["Paquetería larga", "Larga angosta"],
    ["Paquetería larga", "Corta"],
    ["Paquetería corta", "Comercial"],
    ["Paquetería corta", "Paquetería larga"],
    ["Paquetería corta", "Corta"],
  ])("de %s sale %s", (desde, hacia) => {
    expect(puedeReprocesarse(desde, hacia)).toBe(true);
    expect(porQueNoSePuede(desde, hacia)).toBeNull();
  });

  it("comercial y paquetería dan CUALQUIER otro tipo del catálogo", () => {
    for (const desde of ["Comercial", "Paquetería larga", "Paquetería corta"]) {
      for (const hacia of ORDEN_TIPO) {
        if (hacia === "Otro" || hacia === desde) continue;
        expect([desde, hacia, puedeReprocesarse(desde, hacia)]).toEqual([desde, hacia, true]);
      }
    }
  });
});

describe("lo que NO se puede", () => {
  it.each([
    ["Tabla", "Comercial"],
    ["Tabla", "Corta"],
    ["Corta", "Comercial"],
    ["Corta", "Paquetería larga"],
    ["Larga angosta", "Comercial"],
    ["Larga angosta", "Corta"],
    ["Comercial", "Otro"],
    ["Paquetería larga", "Otro"],
  ])("de %s no sale %s", (desde, hacia) => {
    expect(puedeReprocesarse(desde, hacia)).toBe(false);
    /* Y siempre dice POR QUÉ: una fila que desaparece sin explicación se lee
       como un bug del sistema, no como una regla del aserradero. */
    expect(porQueNoSePuede(desde, hacia)).toBeTruthy();
  });

  it("un producto terminado no es origen de nada", () => {
    for (const desde of ["Tabla", "Larga angosta", "Corta", "Otro"]) {
      expect(salidasDeReproceso(desde)).toEqual([]);
      for (const hacia of ORDEN_TIPO) expect(puedeReprocesarse(desde, hacia)).toBe(false);
    }
  });

  it("nadie se reprocesa en «Otro»: no es un producto del Libro", () => {
    for (const t of ORDEN_TIPO) expect(puedeReprocesarse(t, "Otro")).toBe(false);
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
  it("nombra los orígenes vivos y dice cuáles no lo son", () => {
    expect(FRASE_REGLA).toContain("comercial");
    expect(FRASE_REGLA).toContain("paquetería larga");
    expect(FRASE_REGLA).toMatch(/cualquier otro tipo/);
    expect(FRASE_REGLA).toMatch(/producto terminado/);
    /* Los tipos sin salidas no aparecen como origen de nada. */
    expect(FRASE_REGLA).not.toMatch(/de tabla sale/i);
  });
});
