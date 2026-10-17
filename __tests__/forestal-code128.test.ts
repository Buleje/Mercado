import { describe, expect, it } from "vitest";
import {
  CODE128_PATRONES,
  CODE128_ZONA_MUDA,
  checksumCode128,
  code128Svg,
  modulosCode128,
  textoCode128,
  valoresCode128,
} from "@/lib/forestal/code128";

const START_B = "11010010000";
const STOP = "1100011101011";

describe("tabla de patrones Code 128", () => {
  it("tiene los 107 símbolos (0-102 datos, 103-105 START, 106 STOP)", () => {
    expect(CODE128_PATRONES).toHaveLength(107);
  });

  it("cada símbolo suma 11 módulos y el STOP 13 — un typo en la tabla lo rompe", () => {
    CODE128_PATRONES.forEach((p, v) => {
      const suma = [...p].reduce((a, c) => a + Number(c), 0);
      expect(suma, `símbolo ${v} = ${p}`).toBe(v === 106 ? 13 : 11);
    });
  });

  it("no hay dos símbolos iguales", () => {
    expect(new Set(CODE128_PATRONES).size).toBe(107);
  });

  it("valores conocidos de la norma: espacio, START-B y STOP", () => {
    expect(CODE128_PATRONES[0]).toBe("212222"); // espacio (ASCII 32)
    expect(CODE128_PATRONES[104]).toBe("211214"); // START B
    expect(CODE128_PATRONES[106]).toBe("2331112"); // STOP
  });
});

describe("checksum", () => {
  it("PJJ123C (ejemplo de la norma): 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55", () => {
    expect(valoresCode128("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55]);
    expect(checksumCode128("PJJ123C")).toBe(55);
  });

  it("un código de planta de Blas: 115-A", () => {
    // 1=17, 1=17, 5=21, -=13, A=33 → 104 + 17 + 34 + 63 + 52 + 165 = 435 → 435 mod 103 = 23
    expect(checksumCode128("115-A")).toBe(23);
  });
});

describe("módulos", () => {
  it("arranca con START-B y termina con STOP", () => {
    const bits = modulosCode128("115-A");
    expect(bits.startsWith(START_B)).toBe(true);
    expect(bits.endsWith(STOP)).toBe(true);
  });

  it("largo = 11 × (caracteres + START + CHECKSUM) + 13 del STOP", () => {
    expect(modulosCode128("115-A")).toHaveLength(11 * (5 + 2) + 13);
  });

  it("el carácter A (valor 33) se dibuja con su patrón 111323", () => {
    const bits = modulosCode128("A");
    // START-B | A | checksum | STOP
    expect(bits.slice(11, 22)).toBe("10100011000");
  });
});

describe("texto codificable", () => {
  it("quita tildes y reemplaza lo que no es ASCII imprimible", () => {
    expect(textoCode128("Tornillo Ñ")).toBe("Tornillo N");
    expect(textoCode128("Ø45")).toBe("-45");
  });
});

describe("code128Svg", () => {
  it("SVG con zona muda de 10 módulos a cada lado y sin nada externo", () => {
    const svg = code128Svg("115-A");
    const ancho = 11 * 7 + 13 + CODE128_ZONA_MUDA * 2;
    expect(svg).toContain(`viewBox="0 0 ${ancho} 40"`);
    expect(svg).toContain(`<rect x="${CODE128_ZONA_MUDA}" y="0" width="2"`); // la 1ª barra del START (2 módulos)
    expect(svg).not.toMatch(/href|src=/);
  });

  it("sin texto, sin barras", () => {
    expect(code128Svg("")).toBe("");
    expect(code128Svg("   ")).toBe("");
  });

  it("el aria-label no rompe el atributo con comillas", () => {
    expect(code128Svg('A"B')).not.toContain('label="Código de barras A"B"');
  });
});
