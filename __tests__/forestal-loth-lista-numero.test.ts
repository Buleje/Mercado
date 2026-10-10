import { describe, expect, it } from "vitest";
import {
  FILAS_POR_LISTA,
  hojasDeLista,
  leerNumerosDeLista,
  listasEfectivas,
  partirEnHojas,
  proponerListas,
} from "@/lib/forestal/loth-lista-numero";

/**
 * El N° de la lista de trozas tiene su propio correlativo. Evidencia: guías
 * de SERFOR guardadas — 019-001-0000003 (34 trozas) → «5, 6»;
 * 019-001-0000004 (31 trozas) → «7, 8».
 */
describe("leerNumerosDeLista", () => {
  it("lee como se escribe en el casillero (35)", () => {
    expect(leerNumerosDeLista("5, 6")).toEqual([5, 6]);
    expect(leerNumerosDeLista("5-6")).toEqual([5, 6]);
    expect(leerNumerosDeLista("5 y 6")).toEqual([5, 6]);
    expect(leerNumerosDeLista("7 al 9")).toEqual([7, 8, 9]);
    expect(leerNumerosDeLista("8")).toEqual([8]);
    expect(leerNumerosDeLista("N° 12")).toEqual([12]);
  });

  it("un N° de guía o un rango largo no son listas", () => {
    expect(leerNumerosDeLista("019-001-0000065")).toEqual([]);
    expect(leerNumerosDeLista("1234567")).toEqual([]);
    expect(leerNumerosDeLista("5-60")).toEqual([5, 60]);
    expect(leerNumerosDeLista("")).toEqual([]);
    expect(leerNumerosDeLista(null)).toEqual([]);
  });

  it("un código como los publica SERFOR no son listas: el (35) se guarda tal cual", () => {
    // Base, 29-09-2026: 010-001-0000014 → «10-000011»; 019-0000001 → «L-19-0300920».
    expect(leerNumerosDeLista("10-000011")).toEqual([]);
    expect(leerNumerosDeLista("L-19-0300920")).toEqual([]);
    expect(leerNumerosDeLista("019-0000065")).toEqual([]);
    expect(leerNumerosDeLista("000004")).toEqual([4]);
    expect(listasEfectivas("10-000012", 1)).toEqual({ numeros: [], texto: "10-000012", aviso: null });
    expect(listasEfectivas("L-19-0300920", 2).texto).toBe("L-19-0300920");
    expect(listasEfectivas("L-19-0300920", 2).aviso).not.toBeNull();
    expect(proponerListas({ usadas: ["L-19-0300920", "10-000011"], trozas: 5 }).texto).toBeNull();
  });
});

describe("hojasDeLista — dentro del rango de SERFOR (17-30 filas)", () => {
  it("la constante cae en el rango medido", () => {
    expect(FILAS_POR_LISTA).toBeGreaterThanOrEqual(17);
    expect(FILAS_POR_LISTA).toBeLessThanOrEqual(30);
  });

  it("34 y 31 trozas son 2 listas, como en SERFOR", () => {
    expect(hojasDeLista(34)).toBe(2);
    expect(hojasDeLista(31)).toBe(2);
    expect(hojasDeLista(FILAS_POR_LISTA)).toBe(1);
    expect(hojasDeLista(FILAS_POR_LISTA + 1)).toBe(2);
    expect(hojasDeLista(0)).toBe(0);
  });

  it("parte las filas como el papel", () => {
    expect(partirEnHojas(Array.from({ length: 34 })).map((h) => h.length)).toEqual([FILAS_POR_LISTA, 34 - FILAS_POR_LISTA]);
  });
});

describe("proponerListas — sigue a las del titular", () => {
  it("5, 6 → 7, 8 → 9, 10: una por hoja", () => {
    expect(proponerListas({ usadas: ["5, 6", "7, 8"], trozas: 34 })).toMatchObject({ texto: "9, 10", primera: 9, hojas: 2, ultimo: 8 });
    expect(proponerListas({ usadas: ["5, 6"], trozas: 10 }).texto).toBe("7");
  });

  it("sin listas anteriores no se inventa el 1; sin trozas no hay listas", () => {
    expect(proponerListas({ usadas: [], trozas: 34 })).toMatchObject({ texto: null, primera: null, hojas: 2 });
    expect(proponerListas({ usadas: ["019-001-0000003", "", null], trozas: 5 }).texto).toBeNull();
    expect(proponerListas({ usadas: ["5, 6"], trozas: 0 }).texto).toBeNull();
  });
});

describe("listasEfectivas — un N° por hoja", () => {
  it("con el de la primera, las siguientes se numeran solas", () => {
    expect(listasEfectivas("9", 2)).toEqual({ numeros: [9, 10], texto: "9, 10", aviso: null });
    expect(listasEfectivas("9, 10", 3).texto).toBe("9, 10, 11");
  });

  it("de más: se usan los primeros y se avisa", () => {
    const r = listasEfectivas("9, 10, 11", 2);
    expect(r.texto).toBe("9, 10");
    expect(r.aviso).toContain("sobra 11");
  });

  it("vacío queda vacío; un texto sin números se respeta con aviso", () => {
    expect(listasEfectivas("", 2)).toEqual({ numeros: [], texto: "", aviso: null });
    expect(listasEfectivas("A", 1)).toMatchObject({ numeros: [], texto: "A" });
    expect(listasEfectivas("A", 1).aviso).not.toBeNull();
  });
});
