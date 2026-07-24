/**
 * Clasificación por tipo comercial según espesor · ancho · largo, con las
 * reglas del aserradero (Ucayali/Pucallpa). Orden por especificidad: las de
 * sección exacta ganan sobre las de rango.
 */
import { describe, expect, it } from "vitest";
import { clasificarTipo, tipoCorto, tonoTipo, type MedidaPieza } from "@/lib/forestal/cubicacion-tipo";

function m(espesor: number, ancho: number, largo: number, u: Partial<MedidaPieza> = {}): MedidaPieza {
  return { espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", ...u };
}

describe("clasificarTipo", () => {
  it("Tabla: espesor exacto 1, ancho ≥ 3, largo ≥ 6", () => {
    expect(clasificarTipo(m(1, 4, 8))).toBe("Tabla");
    expect(clasificarTipo(m(1, 3, 6))).toBe("Tabla");   // justo en los mínimos
    expect(clasificarTipo(m(1, 8, 10))).toBe("Tabla");  // tabla ancha
    expect(clasificarTipo(m(1, 2, 8))).not.toBe("Tabla"); // ancho < 3
  });

  it("Paquetería larga/corta: sección exacta 6×6, gana sobre comercial", () => {
    expect(clasificarTipo(m(6, 6, 8))).toBe("Paquetería larga");  // no "Comercial"
    expect(clasificarTipo(m(6, 6, 4))).toBe("Paquetería corta");  // no "Corta comercial"
    expect(clasificarTipo(m(6, 6, 6))).toBe("Paquetería larga");  // largo 6 = largo
  });

  it("Comercial: espesor ≥ 2, ancho ≥ 6, largo ≥ 6", () => {
    expect(clasificarTipo(m(2, 8, 10))).toBe("Comercial");
    expect(clasificarTipo(m(2, 6, 6))).toBe("Comercial"); // justo en los umbrales
    expect(clasificarTipo(m(3, 12, 8))).toBe("Comercial");
  });

  it("Larga angosta: espesor ≤ 5, ancho ≤ 5, largo ≥ 6", () => {
    expect(clasificarTipo(m(2, 4, 8))).toBe("Larga angosta");  // ancho < 6, no comercial
    expect(clasificarTipo(m(5, 5, 8))).toBe("Larga angosta");
    expect(clasificarTipo(m(3, 3, 12))).toBe("Larga angosta");
  });

  it("Corta: UNA categoría para toda pieza corta — espesor ≥ 1, ancho ≥ 2, largo < 6", () => {
    expect(clasificarTipo(m(2, 8, 4))).toBe("Corta");    // antes "Corta comercial"
    expect(clasificarTipo(m(3, 10, 5))).toBe("Corta");   // antes "Corta comercial"
    expect(clasificarTipo(m(2, 4, 4))).toBe("Corta");    // antes "Corta" chica
    expect(clasificarTipo(m(1.5, 2, 3))).toBe("Corta");
    expect(clasificarTipo(m(1, 2, 4))).toBe("Corta");    // justo en los pisos (esp 1, anc 2)
    expect(clasificarTipo(m(5, 5, 5))).toBe("Corta");
    expect(clasificarTipo(m(5, 5, 6))).toBe("Larga angosta"); // largo 6 = largo, no Corta
    expect(clasificarTipo(m(0.5, 4, 4))).not.toBe("Corta");   // espesor < 1 → Otro
    expect(clasificarTipo(m(2, 1, 4))).not.toBe("Corta");     // ancho < 2 → Otro
  });

  it("Otro: lo que no cae en ninguna", () => {
    expect(clasificarTipo(m(6, 3, 8))).toBe("Otro");   // ancho 3, espesor 6, largo: ni paq ni comercial ni angosta
    expect(clasificarTipo(m(0.5, 4, 4))).toBe("Otro"); // espesor < 1 (corta pero muy fina)
    expect(clasificarTipo(m(2, 1, 4))).toBe("Otro");   // ancho < 2 (corta pero muy angosta)
  });

  it("respeta las unidades: cm y m se convierten a pulg/pies", () => {
    // 15.24cm = 6", 3m = 9.84' → paquetería larga
    expect(clasificarTipo(m(15.24, 15.24, 3, { uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toBe("Paquetería larga");
    // 2.54cm = 1" espesor, 4" ancho (10.16cm), 8 pies → tabla
    expect(clasificarTipo(m(2.54, 10.16, 8, { uEspesor: "cm", uAncho: "cm" }))).toBe("Tabla");
  });

  it("etiqueta corta y tono", () => {
    expect(tipoCorto("Larga angosta")).toBe("L. angosta");
    expect(tipoCorto("Paquetería larga")).toBe("Paq. larga");
    expect(tipoCorto("Corta")).toBe("Corta");
    expect(tonoTipo("Comercial")).toBe("success");
    expect(tonoTipo("Tabla")).toBe("info");
    expect(tonoTipo("Larga angosta")).toBe("warning");
    expect(tonoTipo("Corta")).toBe("warning");
    expect(tonoTipo("Paquetería corta")).toBe("neutral");
    expect(tonoTipo("Otro")).toBe("neutral");
  });
});
