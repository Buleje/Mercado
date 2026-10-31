/**
 * __tests__/ctp-hipotesis-de-carga.test.ts
 *
 * Los dos casos reales del libro de Blas, que se comportan distinto a propósito:
 * la corrida 24 (141 piezas en 0,0090 m³) se explica si lo cargado era el
 * volumen de una pieza; la 26 (141 en 0,0010) NO se explica ni así, y ahí no se
 * propone ningún número.
 */
import { describe, expect, it } from "vitest";

import { explicarHipotesis, hipotesisDeCarga, referenciaDe } from "@/lib/forestal/hipotesis-de-carga";

/** Los paquetes con escuadría que el libro tiene medidos hoy. */
const MEDIDOS = [
  { productType: "MADERA ASERRADA (PAQUETERIA CORTA)", m3PorPieza: 0.01061 },
  { productType: "MADERA ASERRADA (TABLA)", m3PorPieza: 0.0126 },
  { productType: "MADERA ASERRADA (TABLA)", m3PorPieza: 0.0094 },
];
const REF_CORTA = referenciaDe("MADERA ASERRADA (PAQUETERIA CORTA)", MEDIDOS);

describe("hipotesisDeCarga", () => {
  it("corrida 24: 141 piezas en 0,0090 m³ se explica como volumen unitario", () => {
    const h = hipotesisDeCarga(0.009, 141, REF_CORTA);
    expect(h).toMatchObject({ tipo: "volumen-unitario" });
    expect(h?.tipo === "volumen-unitario" && h.totalPropuesto).toBeCloseTo(1.269, 3);
  });

  it("corrida 26: 0,0010 no cierra ni como unitario — no se propone número", () => {
    const h = hipotesisDeCarga(0.001, 141, REF_CORTA);
    expect(h).toMatchObject({ tipo: "sin-explicacion" });
    expect(h && "totalPropuesto" in h).toBe(false);
  });

  it("sin referencia dice la cuenta, pero NO dictamina que no cierra", () => {
    const h = hipotesisDeCarga(0.009, 141, null);
    expect(h).toMatchObject({ tipo: "sin-referencia" });
    expect(h?.tipo === "sin-referencia" && h.totalPropuesto).toBeCloseTo(1.269, 3);
    expect(explicarHipotesis(h, (n) => n.toFixed(4))).toContain("no tiene otra corrida de este producto");
    expect(referenciaDe("MADERA ASERRADA (LARGA)", MEDIDOS)).toBeNull();
    expect(referenciaDe(null, MEDIDOS)).toBeNull();
  });

  it("la referencia es la mediana: un paquete raro no corre la de todos", () => {
    expect(referenciaDe("MADERA ASERRADA (TABLA)", MEDIDOS)).toBeCloseTo(0.011, 3);
    expect(
      referenciaDe("X", [
        { productType: "X", m3PorPieza: 0.01 },
        { productType: "X", m3PorPieza: 0.011 },
        { productType: "X", m3PorPieza: 9 },
      ]),
    ).toBe(0.011);
  });

  it("una corrida de una sola pieza no tiene esta hipótesis", () => {
    expect(hipotesisDeCarga(0.013, 1, REF_CORTA)).toBeNull();
    expect(hipotesisDeCarga(0, 141, REF_CORTA)).toBeNull();
  });

  it("la frase dice la cuenta, y cuando no cierra manda a mirar el parte", () => {
    const fmt = (n: number) => n.toFixed(4);
    expect(explicarHipotesis(hipotesisDeCarga(0.009, 141, REF_CORTA), fmt)).toContain("1.2690");
    expect(explicarHipotesis(hipotesisDeCarga(0.001, 141, REF_CORTA), fmt)).toContain("mirar el parte");
    expect(explicarHipotesis(null, fmt)).toBeNull();
  });
});
