import { describe, it, expect } from "vitest";
import { repararFichaSerfor, repararSinAmbiguedad, repararTextoSerfor } from "@/lib/forestal/serfor-texto-danado";

/**
 * Texto dañado de la consulta pública de SERFOR (medido 2026-09-25 en Blas:
 * 21 de 26 fichas con «SANTOS MUÃ?OZ JOSE HORD», y el mismo nombre bien escrito
 * en otro campo de la MISMA página).
 */
describe("repararSinAmbiguedad", () => {
  it("decodifica las minúsculas con tilde que sobreviven como par visible", () => {
    expect(repararSinAmbiguedad("JosÃ© MarÃ­a PeÃ±a")).toBe("José María Peña");
    expect(repararSinAmbiguedad("RamÃ³n NÃºÃ±ez")).toBe("Ramón Núñez");
  });
  it("las mayúsculas que pasaron por Windows-1252 también («Ã‘» = Ñ)", () => {
    expect(repararSinAmbiguedad("PEÃ‘A")).toBe("PEÑA");
    expect(repararSinAmbiguedad("CONCEPCIÃ“N")).toBe("CONCEPCIÓN");
  });
  it("«Â°» y compañía vuelven a su signo", () => {
    expect(repararSinAmbiguedad("NÂ° 12")).toBe("N° 12");
  });
  it("no toca texto sano ni el portugués «SÃO»", () => {
    expect(repararSinAmbiguedad("MUÑOZ")).toBe("MUÑOZ");
    expect(repararSinAmbiguedad("SÃO PAULO")).toBe("SÃO PAULO");
  });
  it("«Ã?» NO se adivina sin contexto: la letra se perdió", () => {
    expect(repararSinAmbiguedad("MUÃ?OZ")).toBe("MUÃ?OZ");
  });
});

describe("repararTextoSerfor (con contexto de la misma ficha)", () => {
  it("el caso real: el propietario roto se repara con el titular bien escrito", () => {
    const contexto = ["SANTOS MUÑOZ JOSE HORD", "SANTOS MUÃ?OZ JOSE HORD"];
    expect(repararTextoSerfor("SANTOS MUÃ?OZ JOSE HORD", contexto)).toBe("SANTOS MUÑOZ JOSE HORD");
  });
  it("sin la palabra sana en la ficha, queda como vino", () => {
    expect(repararTextoSerfor("SANTOS MUÃ?OZ", ["OTRO NOMBRE"])).toBe("SANTOS MUÃ?OZ");
  });
  it("si la ficha trae dos candidatas distintas, no elige", () => {
    expect(repararTextoSerfor("MARÃ?A", ["MARÍA", "MARÁA"])).toBe("MARÃ?A");
  });
  it("dos letras perdidas en una palabra: no hay forma honesta de elegir", () => {
    expect(repararTextoSerfor("ÃÃ?Ã?", ["X"])).toBe("ÃÃ?Ã?");
  });
  it("la palabra tiene que coincidir entera (MUÑOZA no repara MUÃ?OZ)", () => {
    expect(repararTextoSerfor("MUÃ?OZ", ["MUÑOZA"])).toBe("MUÃ?OZ");
  });
});

describe("repararFichaSerfor", () => {
  it("repara todos los textos anidados y deja números y claves intactos", () => {
    const ficha = {
      titular: "SANTOS MUÑOZ JOSE HORD",
      propietario: "SANTOS MUÃ?OZ JOSE HORD",
      volumenTotal: 13.939,
      productos: [{ comun: "CaÃ±a brava", cantidad: 2 }],
      campos: { "N° RUC/DNI": "10456789012" },
    };
    const r = repararFichaSerfor(ficha);
    expect(r.propietario).toBe("SANTOS MUÑOZ JOSE HORD");
    expect(r.productos[0]).toEqual({ comun: "Caña brava", cantidad: 2 });
    expect(r.volumenTotal).toBe(13.939);
    expect(Object.keys(r.campos)).toEqual(["N° RUC/DNI"]);
  });
  it("una ficha sana vuelve igual (el mismo objeto)", () => {
    const ficha = { titular: "COMUNIDAD NATIVA SAN LUIS" };
    expect(repararFichaSerfor(ficha)).toBe(ficha);
  });
});
