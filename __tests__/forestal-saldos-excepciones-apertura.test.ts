/**
 * Un rojo que se equivoca enseña a ignorar la lista entera.
 *
 * «Especie en negativo · no cuadra ante SERFOR» se juzgaba con el MOVIMIENTO del
 * período: ingreso − consumo. Para cualquier planta con stock heredado eso es
 * falso — un patio que arranca el mes con 150 m³, recibe 32 y asierra 114
 * termina con 68 m³ y el libro perfecto, y la pantalla igual gritaba que no
 * cuadra. La existencia que se declara es la FINAL (ADR-139 rollforward).
 *
 * El otro lado: cuando SÍ está mal, el aviso ahora dice DÓNDE. El desglose sale
 * de un hecho estructural —corridas con `ForestCtpConsumo` vacío—, no de leer
 * el texto libre de `observations`.
 */
import { describe, expect, it } from "vitest";

import { excepcionesDeSaldo, type EntradaExcepciones } from "@/lib/forestal/ctp-saldos-excepciones";

const base: EntradaExcepciones = {
  materiaPrima: { pendienteM3: 0 },
  porEspecie: [],
  productos: [],
};

const tornillo = (saldoM3: number) => ({
  especie: "TORNILLO",
  saldoM3,
  ingresoM3: 32.933,
  consumidoM3: 114.74,
});

const negativa = (ex: ReturnType<typeof excepcionesDeSaldo>) => ex.find((e) => e.clave === "mp-negativa");

describe("la existencia que se juzga es la final, no el movimiento", () => {
  it("sin conciliación se usa el movimiento: es todo lo que se sabe", () => {
    const ex = excepcionesDeSaldo({ ...base, porEspecie: [tornillo(-81.807)] });
    expect(negativa(ex)?.magnitud).toBeCloseTo(81.807, 3);
  });

  it("con apertura que cubre el consumo NO hay excepción — el libro cuadra", () => {
    // 150 heredados + 32.933 − 114.74 = 68.19 m³ de existencia final.
    const ex = excepcionesDeSaldo({
      ...base,
      porEspecie: [tornillo(-81.807)],
      existenciaFinal: [{ especie: "TORNILLO", final: 68.193 }],
    });
    expect(negativa(ex)).toBeUndefined();
  });

  it("con apertura que NO alcanza, la magnitud es la final, no la del período", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      porEspecie: [tornillo(-81.807)],
      existenciaFinal: [{ especie: "TORNILLO", final: -10 }],
    });
    expect(negativa(ex)?.magnitud).toBe(10);
    expect(negativa(ex)?.items).toEqual(["TORNILLO (-10.00 m³)"]);
  });

  it("la especie se cruza con `claveEspecie`: tilde y mayúscula no parten el balde", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      porEspecie: [{ ...tornillo(-40), especie: "Ishpíngo" }],
      existenciaFinal: [{ especie: "ISHPINGO", final: 12 }],
    });
    expect(negativa(ex)).toBeUndefined();
  });

  it("una especie sin fila en la conciliación cae al movimiento, no se da por buena", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      porEspecie: [tornillo(-81.807), { ...tornillo(-5), especie: "CAPIRONA" }],
      existenciaFinal: [{ especie: "TORNILLO", final: 68.193 }],
    });
    expect(negativa(ex)?.items).toEqual(["CAPIRONA (-5.00 m³)"]);
  });
});

describe("el detalle dice dónde está el faltante", () => {
  it("con desglose nombra los m³ y las corridas sin guía atribuida", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      materiaPrima: { pendienteM3: 0, consumoSinOrigenM3: 109.329, consumoSinOrigenCount: 3 },
      porEspecie: [tornillo(-81.807)],
    });
    expect(negativa(ex)?.detalle).toContain("109.33 m³");
    expect(negativa(ex)?.detalle).toContain("3 corridas");
    expect(negativa(ex)?.detalle).toContain("SERFOR");
  });

  it("sin desglose vuelve al texto genérico — no inventa una causa", () => {
    const ex = excepcionesDeSaldo({ ...base, porEspecie: [tornillo(-81.807)] });
    expect(negativa(ex)?.detalle).toContain("O falta validar un ingreso");
  });

  it("con apertura el encabezado habla de existencia final, no de «ingresó validado»", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      porEspecie: [tornillo(-81.807)],
      existenciaFinal: [{ especie: "TORNILLO", final: -10 }],
    });
    expect(negativa(ex)?.detalle).toContain("existencia final");
  });
});

describe("corridas abiertas: la madera bajó, el producto todavía no", () => {
  const sinDeclarar = (ex: ReturnType<typeof excepcionesDeSaldo>) => ex.find((e) => e.clave === "sin-declarar");

  it("avisa con el volumen y la cantidad, y lleva a Producción", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      materiaPrima: { pendienteM3: 0, consumoSinDeclararM3: 5.411, consumoSinDeclararCount: 1 },
    });
    expect(sinDeclarar(ex)?.titulo).toBe("5.41 m³ en 1 corrida sin declarar");
    expect(sinDeclarar(ex)?.tono).toBe("warning");
    expect(sinDeclarar(ex)?.ir).toBe("produccion");
  });

  it("sin corridas abiertas no dibuja nada", () => {
    expect(sinDeclarar(excepcionesDeSaldo(base))).toBeUndefined();
    expect(
      sinDeclarar(
        excepcionesDeSaldo({ ...base, materiaPrima: { pendienteM3: 0, consumoSinDeclararM3: 0, consumoSinDeclararCount: 0 } }),
      ),
    ).toBeUndefined();
  });

  it("no es un error: va después de los que sí bloquean el cierre", () => {
    const ex = excepcionesDeSaldo({
      ...base,
      materiaPrima: { pendienteM3: 0, consumoSinDeclararM3: 5.411, consumoSinDeclararCount: 1 },
      porEspecie: [tornillo(-81.807)],
    });
    expect(ex[0].clave).toBe("mp-negativa");
    expect(ex.findIndex((e) => e.clave === "sin-declarar")).toBeGreaterThan(0);
  });
});
