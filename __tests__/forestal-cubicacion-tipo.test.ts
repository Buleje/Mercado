/**
 * Clasificación por tipo comercial (comercial / paquetería larga / corta) según
 * espesor · ancho · largo, con las reglas del aserradero (Ucayali/Pucallpa).
 */
import { describe, expect, it } from "vitest";
import { clasificarTipo, tipoCorto, tonoTipo, type MedidaPieza } from "@/lib/forestal/cubicacion-tipo";

function m(espesor: number, ancho: number, largo: number, u: Partial<MedidaPieza> = {}): MedidaPieza {
  return { espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", ...u };
}

describe("clasificarTipo", () => {
  it("comercial: espesor ≥ 2, ancho ≥ 6, largo ≥ 6", () => {
    expect(clasificarTipo(m(2, 8, 10))).toBe("Comercial");
    expect(clasificarTipo(m(2, 6, 6))).toBe("Comercial"); // justo en los umbrales
    expect(clasificarTipo(m(3, 12, 8))).toBe("Comercial");
  });

  it("paquetería corta: largo por debajo de 6 pies", () => {
    expect(clasificarTipo(m(2, 8, 5))).toBe("Paquetería corta"); // sección plena pero corta
    expect(clasificarTipo(m(1, 4, 4))).toBe("Paquetería corta");
    expect(clasificarTipo(m(2, 8, 3))).toBe("Paquetería corta");
  });

  it("paquetería larga: largo ≥ 6 pero sección por debajo de comercial", () => {
    expect(clasificarTipo(m(1, 4, 10))).toBe("Paquetería larga"); // delgada y angosta
    expect(clasificarTipo(m(2, 4, 8))).toBe("Paquetería larga"); // ancho < 6
    expect(clasificarTipo(m(1.5, 8, 12))).toBe("Paquetería larga"); // espesor < 2
  });

  it("respeta las unidades: cm y m se convierten a pulg/pies", () => {
    // 5cm×20cm×3m = 1.97"×7.87"×9.84' → espesor < 2 → paquetería larga
    expect(clasificarTipo(m(5, 20, 3, { uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toBe("Paquetería larga");
    // 6cm×20cm×3m = 2.36"×7.87"×9.84' → comercial
    expect(clasificarTipo(m(6, 20, 3, { uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toBe("Comercial");
    // 6cm×20cm×1.5m = 2.36"×7.87"×4.92' → corta
    expect(clasificarTipo(m(6, 20, 1.5, { uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toBe("Paquetería corta");
  });

  it("etiqueta corta y tono", () => {
    expect(tipoCorto("Comercial")).toBe("Comercial");
    expect(tipoCorto("Paquetería larga")).toBe("Paq. larga");
    expect(tipoCorto("Paquetería corta")).toBe("Paq. corta");
    expect(tonoTipo("Comercial")).toBe("success");
    expect(tonoTipo("Paquetería larga")).toBe("info");
    expect(tonoTipo("Paquetería corta")).toBe("neutral");
  });
});
