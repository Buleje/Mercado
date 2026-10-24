/**
 * El panel «qué volvió a la sierra» (ADR-316 · ADR-407).
 *
 * Lo que se protege acá son las dos cuentas que un fiscalizador mira: la
 * **merma** (entró − salió, nunca al revés) y **qué se convirtió en qué**, con
 * lo que no es habitual marcado y explicado. Un reproceso que declare más
 * salida que entrada no es un rendimiento excelente: es un asiento mal cargado.
 */

import { describe, expect, it } from "vitest";
import {
  analizarReproceso,
  conversionesFrecuentes,
  resumirReprocesos,
  type ReprocesoDeclarado,
} from "@/lib/forestal/reprocesos-declarados";

const repro = (o: Partial<ReprocesoDeclarado> & { destinoEntryId: string }): ReprocesoDeclarado => ({
  lineNo: 1,
  fecha: "2026-09-01T00:00:00.000Z",
  producto: "MADERA ASERRADA (PAQUETERIA LARGA)",
  especie: "TORNILLO",
  unidad: "m3",
  salio: 0.8,
  observaciones: null,
  permiso: null,
  origenes: [
    { entryId: "o1", lineNo: 10, producto: "MADERA ASERRADA (COMERCIAL)", especie: "TORNILLO", cantidad: 1 },
  ],
  ...o,
});

describe("analizarReproceso — la merma es entró − salió", () => {
  it("calcula merma y porcentaje sobre lo que entró", () => {
    const r = analizarReproceso(repro({ destinoEntryId: "d1", salio: 0.8 }));
    expect(r.entro).toBe(1);
    expect(r.mermaM3).toBe(0.2);
    expect(r.mermaPct).toBe(20);
    expect(r.sospechoso).toBe(false);
  });

  it("si salió MÁS de lo que entró no muestra merma negativa: lo marca", () => {
    /* Un reproceso no crea madera. Mostrar «−0.3 m³ de merma» invita a leerlo
       como un rendimiento del 130 %. */
    const r = analizarReproceso(repro({ destinoEntryId: "d2", salio: 1.3 }));
    expect(r.sospechoso).toBe(true);
    expect(r.mermaM3).toBe(0);
  });

  it("suma varias corridas de origen: el reproceso es UNO", () => {
    const r = analizarReproceso(
      repro({
        destinoEntryId: "d3",
        salio: 1.5,
        origenes: [
          { entryId: "a", lineNo: 1, producto: "MADERA ASERRADA (COMERCIAL)", especie: "T", cantidad: 1 },
          { entryId: "b", lineNo: 2, producto: "MADERA ASERRADA (COMERCIAL)", especie: "T", cantidad: 0.8 },
        ],
      }),
    );
    expect(r.entro).toBe(1.8);
    /* Dos corridas del MISMO tipo son una sola conversión, no dos renglones
       iguales que hay que sumar con el dedo. */
    expect(r.conversiones.length).toBe(1);
    expect(r.conversiones[0].cantidad).toBe(1.8);
  });

  it("marca la conversión que no es de las habituales y dice por qué", () => {
    const r = analizarReproceso(
      repro({
        destinoEntryId: "d4",
        producto: "MADERA ASERRADA (COMERCIAL)",
        origenes: [
          { entryId: "t", lineNo: 3, producto: "MADERA ASERRADA (TABLA)", especie: "T", cantidad: 1 },
        ],
      }),
    );
    expect(r.tieneNoHabitual).toBe(true);
    expect(r.conversiones[0]).toMatchObject({ desde: "Tabla", hacia: "Comercial", habitual: false });
    expect(r.conversiones[0].porque).toMatch(/producto terminado/);
  });

  it("un producto sin tipo conocido no se marca como raro", () => {
    /* «MADERA ASERRADA» a secas no dice qué es: inventar una advertencia sobre
       eso enseña a ignorar las advertencias. */
    const r = analizarReproceso(
      repro({
        destinoEntryId: "d5",
        producto: "MADERA ASERRADA",
        origenes: [
          { entryId: "x", lineNo: 4, producto: "MADERA ASERRADA (TABLA)", especie: "T", cantidad: 1 },
        ],
      }),
    );
    expect(r.tieneNoHabitual).toBe(false);
  });

  it("sin origen declarado no inventa un porcentaje", () => {
    const r = analizarReproceso(repro({ destinoEntryId: "d6", origenes: [] }));
    expect(r.entro).toBe(0);
    expect(r.mermaPct).toBeNull();
  });
});

describe("resumirReprocesos — la merma del conjunto, no el promedio", () => {
  it("pondera por volumen: el 40 % de 0.05 m³ no pesa como el 5 % de 10", () => {
    const grande = analizarReproceso(repro({ destinoEntryId: "g", salio: 9.5, origenes: [
      { entryId: "og", lineNo: 1, producto: "MADERA ASERRADA (COMERCIAL)", especie: "T", cantidad: 10 },
    ] }));
    const chico = analizarReproceso(repro({ destinoEntryId: "c", salio: 0.03, origenes: [
      { entryId: "oc", lineNo: 2, producto: "MADERA ASERRADA (COMERCIAL)", especie: "T", cantidad: 0.05 },
    ] }));
    const r = resumirReprocesos([grande, chico]);
    expect(r.entro).toBe(10.05);
    expect(r.salio).toBe(9.53);
    expect(r.mermaM3).toBeCloseTo(0.52, 4);
    // Ponderado ≈ 5.2 %, no el promedio simple de 5 % y 40 %.
    expect(r.mermaPct).toBeCloseTo(5.2, 1);
  });

  it("cuenta los que hay que explicar y las especies que pasaron", () => {
    const ok = analizarReproceso(repro({ destinoEntryId: "a", especie: "TORNILLO" }));
    const raro = analizarReproceso(
      repro({
        destinoEntryId: "b",
        especie: "CACHIMBO",
        producto: "MADERA ASERRADA (COMERCIAL)",
        origenes: [{ entryId: "t", lineNo: 9, producto: "MADERA ASERRADA (CORTA)", especie: "C", cantidad: 1 }],
      }),
    );
    const sospechoso = analizarReproceso(repro({ destinoEntryId: "c", salio: 5, especie: "TORNILLO" }));
    const r = resumirReprocesos([ok, raro, sospechoso]);
    expect(r.cuantos).toBe(3);
    expect(r.noHabituales).toBe(1);
    expect(r.sospechosos).toBe(1);
    expect(r.especies).toEqual(["CACHIMBO", "TORNILLO"]);
  });
});

describe("conversionesFrecuentes — qué salió de qué, todo junto", () => {
  it("suma el mismo par y pone lo no habitual primero", () => {
    const a = analizarReproceso(repro({ destinoEntryId: "1" }));
    const b = analizarReproceso(repro({ destinoEntryId: "2" }));
    const raro = analizarReproceso(
      repro({
        destinoEntryId: "3",
        producto: "MADERA ASERRADA (COMERCIAL)",
        origenes: [{ entryId: "t", lineNo: 7, producto: "MADERA ASERRADA (TABLA)", especie: "T", cantidad: 0.4 }],
      }),
    );
    const pares = conversionesFrecuentes([a, b, raro]);
    expect(pares[0]).toMatchObject({ desde: "Tabla", hacia: "Comercial", habitual: false, veces: 1 });
    const habitual = pares.find((p) => p.desde === "Comercial");
    expect(habitual).toMatchObject({ veces: 2, cantidad: 2 });
  });
});
