/**
 * Tests — las dos formas de anotar el diámetro en Tala y Trozado (28-09):
 * «D1 y D2 promediados» y «Varias medidas por Ø». Lo que importa: las
 * columnas del libro salen iguales, y con «promediados» la medición cruda NO
 * trae medidas cruzadas que nadie tomó.
 */

import { describe, it, expect } from "vitest";
import {
  cambiarForma,
  conMedidasDelCenso,
  derivarTala,
  formaDeLaLinea,
  medicionCrudaDe,
  medidasDePlantilla,
  medidasVacias,
  type MedidasTala,
} from "@/lib/forestal/loth-forma-medicion";
import { smalianVolume } from "@/lib/forestal/loth-constants";

const cruzadas: MedidasTala = { ...medidasVacias(), mayor: ["1.30", "1.10"], menor: ["0.95", "0.85"], totalM: "4" };
const promediados: MedidasTala = { ...medidasVacias(), d1: "1.20", d2: "0.90", totalM: "4" };

describe("derivarTala · las dos formas dan las mismas columnas", () => {
  it("cruzadas 1.30+1.10 y 0.95+0.85 = D1 1.20 y D2 0.90", () => {
    const a = derivarTala(cruzadas, "cruzadas");
    const b = derivarTala(promediados, "promedio");
    expect(a.diamMayorM).toBe(1.2);
    expect(a.diamMenorM).toBe(0.9);
    expect(b).toEqual(a);
    expect(b.volumenM3).toBeCloseTo(smalianVolume(1.2, 0.9, 4), 6);
  });

  it("cada forma lee sólo sus campos: D1/D2 no cuentan en cruzadas ni al revés", () => {
    expect(derivarTala(promediados, "cruzadas").diamMayorM).toBeNull();
    expect(derivarTala(cruzadas, "promedio").diamMayorM).toBeNull();
  });

  it("falta D2 ⇒ sin volumen, nunca uno a medias", () => {
    expect(derivarTala({ ...promediados, d2: "" }, "promedio").volumenM3).toBeNull();
  });
});

describe("medicionCrudaDe · lo que se guarda con la línea", () => {
  it("promediados: queda la forma escrita y los arreglos vacíos", () => {
    expect(medicionCrudaDe(promediados, "promedio")).toEqual({ forma: "promedio", mayor: [], menor: [], totalM: 4, descuentos: [] });
  });

  it("cruzadas: las medidas tomadas, sin las vacías", () => {
    expect(medicionCrudaDe({ ...cruzadas, menor: ["0.95", ""] }, "cruzadas")).toEqual({
      forma: "cruzadas",
      mayor: [1.3, 1.1],
      menor: [0.95],
      totalM: 4,
      descuentos: [],
    });
  });

  it("sin medir nada no guarda un respaldo vacío", () => {
    expect(medicionCrudaDe(medidasVacias(), "promedio")).toBeNull();
    expect(medicionCrudaDe(medidasVacias(), "cruzadas")).toBeNull();
  });

  it("promediados con sólo D1 igual guarda la forma (el Ø va en la columna)", () => {
    expect(medicionCrudaDe({ ...medidasVacias(), d1: "0.8" }, "promedio")?.forma).toBe("promedio");
  });
});

describe("cambiarForma", () => {
  it("a promediados: D1/D2 vacíos toman el promedio de las cruzadas", () => {
    const m = cambiarForma(cruzadas, "promedio");
    expect(m.d1).toBe("1.2");
    expect(m.d2).toBe("0.9");
    expect(m.mayor).toEqual(["1.30", "1.10"]);
  });

  it("no pisa un D1 ya tipeado", () => {
    expect(cambiarForma({ ...cruzadas, d1: "1.25" }, "promedio").d1).toBe("1.25");
  });

  it("a cruzadas NO inventa medidas con el promedio", () => {
    expect(cambiarForma(promediados, "cruzadas").mayor).toEqual(["", ""]);
  });
});

describe("desde el censo y desde una línea", () => {
  it("el DAP entra como primera medida y como D1, nunca en las dos secciones", () => {
    const m = conMedidasDelCenso(medidasVacias(), 0.95, 21);
    expect(m.mayor).toEqual(["0.95", ""]);
    expect(m.menor).toEqual(["", ""]);
    expect(m.d1).toBe("0.95");
    expect(m.d2).toBe("");
    expect(m.totalM).toBe("21");
    expect(m.origenCenso).toBe(true);
  });

  it("una línea guardada «promediados» se abre así y con su Ø en D1/D2", () => {
    const linea = { diamMayorM: "0.800", diamMenorM: "0.600", lengthM: "3.00", medicionCruda: { forma: "promedio", mayor: [], menor: [], totalM: 3, descuentos: [] } };
    expect(formaDeLaLinea(linea.medicionCruda)).toBe("promedio");
    const m = medidasDePlantilla(linea);
    expect(m.d1).toBe("0.800");
    expect(m.d2).toBe("0.600");
    expect(m.mayor).toEqual(["", ""]);
    expect(derivarTala(m, "promedio").volumenM3).toBeCloseTo(smalianVolume(0.8, 0.6, 3), 6);
  });

  it("una de cruzadas (o vieja) no obliga a ninguna forma", () => {
    expect(formaDeLaLinea({ forma: "cruzadas" })).toBeNull();
    expect(formaDeLaLinea({})).toBeNull();
    expect(formaDeLaLinea(null)).toBeNull();
    const vieja = medidasDePlantilla({ diamMayorM: "0.8", diamMenorM: "0.6", lengthM: "13", medicionCruda: null });
    expect(vieja.mayor[0]).toBe("0.8");
    expect(vieja.d1).toBe("0.8");
  });
});
