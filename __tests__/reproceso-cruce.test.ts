/**
 * «Esto que la distribución sugiere, ¿ya lo declaré?» — el cruce entre el
 * reproceso SUGERIDO (ADR-404) y el DECLARADO (ADR-316).
 *
 * Lo que se protege: que el cruce no dé por declarado lo que no lo está (una
 * especie distinta, una conversión al revés) ni deje de reconocer lo que sí,
 * por una tilde o una mayúscula.
 */
import { describe, expect, it } from "vitest";
import {
  claveDeConversion, cruzarReprocesosDeclarados, estadoDeclarado,
} from "@/lib/forestal/reproceso-cruce";
import type { ReprocesoDeclarado } from "@/lib/forestal/reprocesos-declarados";

const COMERCIAL = "MADERA ASERRADA (COMERCIAL)";
const PAQ_LARGA = "MADERA ASERRADA (PAQUETERIA LARGA)";
const PAQ_CORTA = "MADERA ASERRADA (PAQUETERIA CORTA)";

let n = 0;
/**
 * Los orígenes van como parámetro APARTE y no dentro del `Partial<>`: con
 * `Partial<ReprocesoDeclarado> & { origenes: … }` el tipo de cada origen queda
 * como la intersección de los dos, y el spread se lleva `entryId`/`lineNo`
 * puestos arriba (TS2783 — lo marca `tsc`, no `tsgo`).
 */
function declarado(
  origenes: { producto: string; cantidad: number }[],
  o: Partial<ReprocesoDeclarado> = {},
): ReprocesoDeclarado {
  const especie = o.especie ?? "TORNILLO";
  return {
    destinoEntryId: `d${++n}`,
    lineNo: n,
    fecha: "2026-09-09",
    producto: PAQ_LARGA,
    unidad: "m3",
    salio: 1,
    observaciones: null,
    permiso: null,
    ...o,
    especie,
    origenes: origenes.map((x, i) => ({
      entryId: `o${n}-${i}`,
      lineNo: i + 1,
      especie,
      producto: x.producto,
      cantidad: x.cantidad,
    })),
  };
}

describe("cruzarReprocesosDeclarados", () => {
  it("cuenta lo que SALIÓ, no lo que entró — la merma no es «declarado de más»", () => {
    /* 🚨 El bug que se vio en pantalla al declarar uno de verdad (2026-09-09):
       entraron 0.700 y salieron 0.637, y la fila marcaba «declarado de MÁS»
       contra una sugerencia de 0.637. Todo reproceso sano tiene merma: si se
       compara la entrada, TODOS quedan marcados. */
    const mapa = cruzarReprocesosDeclarados([
      declarado([{ producto: COMERCIAL, cantidad: 0.7 }], { salio: 0.637 }),
    ]);
    const par = mapa.get(claveDeConversion("Tornillo", "Comercial", "Paquetería larga"))!;
    expect(par.m3).toBeCloseTo(0.637, 4);
    expect(par.entroM3).toBeCloseTo(0.7, 4);
    expect(par.repartido).toBe(false);
    expect(estadoDeclarado(0.637, par.m3)).toBe("cubierto");
  });

  it("suma el mismo par de varios asientos y se queda con la fecha más nueva", () => {
    const mapa = cruzarReprocesosDeclarados([
      declarado([{ producto: COMERCIAL, cantidad: 0.5 }], { fecha: "2026-09-01", salio: 0.4 }),
      declarado([{ producto: COMERCIAL, cantidad: 0.25 }], { fecha: "2026-09-09", salio: 0.2 }),
    ]);
    const par = mapa.get(claveDeConversion("Tornillo", "Comercial", "Paquetería larga"));
    expect(par).toBeTruthy();
    expect(par!.m3).toBeCloseTo(0.6, 4);      // 0.4 + 0.2 que SALIERON
    expect(par!.entroM3).toBeCloseTo(0.75, 4); // 0.5 + 0.25 que entraron
    expect(par!.veces).toBe(2);
    expect(par!.ultimaFecha).toBe("2026-09-09");
  });

  it("un asiento con DOS pares reparte lo que salió en proporción a lo que entró, y lo marca", () => {
    const mapa = cruzarReprocesosDeclarados([
      declarado(
        [
          { producto: COMERCIAL, cantidad: 0.6 },
          { producto: PAQ_LARGA, cantidad: 0.4 },
        ],
        { producto: PAQ_CORTA, salio: 0.9 },
      ),
    ]);
    const desdeComercial = mapa.get(claveDeConversion("Tornillo", "Comercial", "Paquetería corta"))!;
    const desdeLarga = mapa.get(claveDeConversion("Tornillo", "Paquetería larga", "Paquetería corta"))!;
    expect(desdeComercial.m3).toBeCloseTo(0.54, 4); // 0.9 × 0.6/1.0
    expect(desdeLarga.m3).toBeCloseTo(0.36, 4);     // 0.9 × 0.4/1.0
    expect(desdeComercial.m3 + desdeLarga.m3).toBeCloseTo(0.9, 4);
    expect(desdeComercial.repartido).toBe(true);
  });

  it("la clave no distingue tildes ni mayúsculas: «TORNILLO» es «Tornillo»", () => {
    expect(claveDeConversion("TORNILLO", "Comercial", "PAQUETERIA LARGA")).toBe(
      claveDeConversion("tornillo", "comercial", "Paquetería larga"),
    );
  });

  it("no cruza especies distintas", () => {
    const mapa = cruzarReprocesosDeclarados([
      declarado([{ producto: COMERCIAL, cantidad: 1 }], { especie: "CACHIMBO" }),
    ]);
    expect(mapa.get(claveDeConversion("Tornillo", "Comercial", "Paquetería larga"))).toBeUndefined();
    expect(mapa.get(claveDeConversion("Cachimbo", "Comercial", "Paquetería larga"))).toBeTruthy();
  });

  it("no cruza la conversión al revés (comercial→paquetería ≠ paquetería→comercial)", () => {
    const mapa = cruzarReprocesosDeclarados([
      declarado([{ producto: PAQ_LARGA, cantidad: 0.3 }], { producto: PAQ_CORTA }),
    ]);
    expect(mapa.get(claveDeConversion("Tornillo", "Paquetería larga", "Paquetería corta"))).toBeTruthy();
    expect(mapa.get(claveDeConversion("Tornillo", "Paquetería corta", "Paquetería larga"))).toBeUndefined();
  });

  it("un asiento con dos orígenes del mismo tipo cuenta UNA conversión sumada", () => {
    const mapa = cruzarReprocesosDeclarados([
      declarado([
        { producto: COMERCIAL, cantidad: 0.2 },
        { producto: COMERCIAL, cantidad: 0.3 },
      ]),
    ]);
    const par = mapa.get(claveDeConversion("Tornillo", "Comercial", "Paquetería larga"))!;
    expect(par.veces).toBe(1);
    expect(par.entroM3).toBeCloseTo(0.5, 4); // 0.2 + 0.3 del MISMO par
    expect(par.repartido).toBe(false);       // un solo par: lo que salió va entero
  });
});

describe("estadoDeclarado — con la tolerancia del patio (10 litros)", () => {
  it.each([
    [0.637, 0, "sin-declarar"],
    [0.637, 0.2, "parcial"],
    [0.637, 0.63, "cubierto"],   // 7 litros menos: la misma madera con otra cinta
    [0.637, 0.62, "parcial"],    // 17 litros: falta declarar de verdad
    [0.637, 0.68, "cubierto"],   // 43 litros de más: todavía es la misma madera
    [0.637, 0.7, "de-mas"],      // 63 litros: ya es otra cosa — o un asiento repetido
    [0.637, 1.4, "de-mas"],
  ] as const)("sugerido %s con %s declarado → %s", (sug, dec, esperado) => {
    expect(estadoDeclarado(sug, dec)).toBe(esperado);
  });

  it("«de más» necesita MEDIA TABLA de diferencia, no una milésima", () => {
    // 0.05 m³ es el mismo piso con el que se sugiere un reproceso.
    expect(estadoDeclarado(1, 1.05)).toBe("cubierto");
    expect(estadoDeclarado(1, 1.051)).toBe("de-mas");
  });
});
