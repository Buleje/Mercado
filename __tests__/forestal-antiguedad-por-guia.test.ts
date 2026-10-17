/**
 * La antigüedad por guía usa la escala ÚNICA del libro (ADR-431, C2):
 * 0-14 · 15-29 · 30-59 · 60 o más, con `>=` y por día UTC.
 *
 * Antes cortaba en 30/60 con `>` estricto: una guía de 30 días salía «hasta 30»
 * acá y «30 a 59» en la pestaña Trozas, y una de 60 no era varada en el Aging
 * pero sí en la tira de pendientes. Estos bordes fijan que eso no vuelva.
 */

import { describe, expect, it } from "vitest";
import { antiguedadPorGuia, type GuiaDisponible } from "@/lib/forestal/antiguedad-por-guia";

/* A las 23:30 de Lima (04:30 UTC del día siguiente) el día UTC ya cambió:
   los bordes se cuentan igual a cualquier hora porque va por día, no por ms. */
const AHORA = new Date("2026-09-24T15:00:00.000Z");

const guia = (
  id: string,
  entryDate: string,
  over: Partial<GuiaDisponible> = {},
): GuiaDisponible => ({
  id,
  code: `G-${id}`,
  entryDate,
  species: "TORNILLO",
  cites: false,
  disponible: 1,
  costoUnitario: 100,
  moneda: "PEN",
  ...over,
});

const hace = (dias: number) => {
  const d = new Date(Date.UTC(2026, 8, 24 - dias));
  return d.toISOString().slice(0, 10);
};

describe("antiguedadPorGuia · bordes de la escala única", () => {
  it.each([
    [14, "hasta15"],
    [15, "16a30"],
    [29, "16a30"],
    [30, "31a60"],
    [59, "31a60"],
    [60, "mas60"],
  ])("%i días cae en %s", (dias, tramo) => {
    const r = antiguedadPorGuia([guia("a", hace(dias))], AHORA);
    expect(r.filas[0].dias).toBe(dias);
    expect(r.filas[0].tramo).toBe(tramo);
  });

  it("varadas = 60 o más; sin costo nunca vale cero", () => {
    const r = antiguedadPorGuia(
      [
        guia("a", hace(61), { disponible: 2.5, costoUnitario: null }),
        guia("b", hace(60), { disponible: 1.5 }),
        guia("c", hace(3), { disponible: 4, costoUnitario: null }),
      ],
      AHORA,
    );
    expect(r.varadas).toEqual({ guias: 2, m3: 4 });
    expect(r.varadasSinCosto).toEqual({ guias: 1, m3: 2.5 });
    expect(r.m3SinCosto).toBe(6.5);
    expect(r.guiasSinCosto).toBe(2);
    expect(r.totValor).toBe(150);
    expect(r.valorParcial).toBe(true);
    const mas60 = r.tramos.find((t) => t.tramo === "mas60");
    expect(mas60?.severidad).toBe("varada");
    expect(mas60?.valorParcial).toBe(true);
  });

  it("el recorte por especie compara por clave", () => {
    const r = antiguedadPorGuia(
      [guia("a", hace(5), { species: "Tornillo" }), guia("b", hace(5), { species: "CAPIRONA" })],
      AHORA,
      "TORNILLO",
    );
    expect(r.filas.map((f) => f.id)).toEqual(["a"]);
  });

  it("ordena de más vieja a más nueva y la suma de tramos da el total", () => {
    const r = antiguedadPorGuia(
      [guia("n", hace(1)), guia("v", hace(90)), guia("m", hace(20))],
      AHORA,
    );
    expect(r.filas.map((f) => f.id)).toEqual(["v", "m", "n"]);
    expect(r.tramos.reduce((a, t) => a + t.m3, 0)).toBe(r.totM3);
  });
});
