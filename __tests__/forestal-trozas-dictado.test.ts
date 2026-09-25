/**
 * __tests__/forestal-trozas-dictado.test.ts
 *
 * El dictado de TROZAS no se lee como el de madera aserrada. Con el parser de
 * la aserrada, un diámetro de 50 cm se partía en 5 y 0 (no existe un espesor
 * de 50 pulgadas): medido el 23-09, 6 de 6 frases entraban mal.
 */
import { describe, expect, it } from "vitest";
import { mejoresNumeros, numerosDeTroza } from "@/lib/forestal/cubicacion";

describe("los números de una troza se respetan como se dijeron", () => {
  it.each([
    ["cincuenta sesenta cuatro punto cinco", [50, 60, 4.5]],
    ["50 60 4.5", [50, 60, 4.5]],
    ["cuarenta y cinco cincuenta y dos tres", [45, 52, 3]],
    ["sesenta setenta cuatro", [60, 70, 4]],
    ["45 52 3", [45, 52, 3]],
    ["cien ciento diez cinco", [100, 110, 5]],
  ])("«%s» → %j", (frase, esperado) => {
    expect(numerosDeTroza(frase)).toEqual(esperado);
  });

  it("sólo se parte lo que ningún diámetro puede ser: cuatro cifras pegadas", () => {
    expect(numerosDeTroza("5060 4")).toEqual([50, 60, 4]);
  });

  it("la madera aserrada sigue partiendo como siempre (no se tocó)", () => {
    expect(mejoresNumeros(["2 8 10"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["28 10"])).toEqual([2, 8, 10]);
  });
});

describe("cifras impares pegadas y diámetros imposibles (revisor 23-09)", () => {
  it("«50604» = 50, 60 y el largo de una cifra al final", () => {
    expect(numerosDeTroza("50604")).toEqual([50, 60, 4]);
  });

  it("un diámetro de más de 200 cm entra marcado como raro", async () => {
    const { partirEnTrozas, DIAMETRO_MAX_CM } = await import("@/lib/forestal/cubicacion-trozas");
    expect(DIAMETRO_MAX_CM).toBe(200);
    expect(partirEnTrozas([250, 60, 4]).trozas[0].sospechosa).toBe(true);
    expect(partirEnTrozas([115, 98, 4]).trozas[0].sospechosa).toBe(false);
  });
});
