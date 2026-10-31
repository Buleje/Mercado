import { describe, expect, it } from "vitest";
import { leerPaqueteDictado, medidasDelDictado } from "@/lib/forestal/produccion-dictado";

describe("leerPaqueteDictado", () => {
  it("«20 de 1×7×5» = 58,33 PT y 0,1376 m³ (PT ÷ 424)", () => {
    const d = leerPaqueteDictado("20 de 1×7×5");
    expect(d).toMatchObject({ cantidad: 20, espesor: 1, ancho: 7, largo: 5, pieTablar: 58.33, m3: 0.1376, metrico: false });
    expect(d && medidasDelDictado(d)).toBe("20 pza de 1″ × 7″ × 5′");
  });

  it("dicho con palabras y sin «de» da lo mismo", () => {
    expect(leerPaqueteDictado("veinte de uno por siete por cinco")?.pieTablar).toBe(58.33);
    expect(leerPaqueteDictado("20 1 por 7 por 5")?.cantidad).toBe(20);
    expect(leerPaqueteDictado("veinte tablas de uno por siete por cinco")?.m3).toBe(0.1376);
  });

  it("tres números solos son UNA pieza, no 1 de 7 × 5", () => {
    expect(leerPaqueteDictado("2 por 8 por 10")).toMatchObject({ cantidad: 1, pieTablar: 13.33 });
  });

  it("en centímetros y metros entra dimensionado", () => {
    const d = leerPaqueteDictado("40 de 5 por 20 por 3 metros centímetros");
    expect(d).toMatchObject({ cantidad: 40, espesor: 5, ancho: 20, largo: 3, metrico: true });
  });

  it("lo que no tiene tres medidas no se inventa", () => {
    expect(leerPaqueteDictado("veinte de uno por siete")).toBeNull();
    expect(leerPaqueteDictado("")).toBeNull();
  });

  /* Revisión 28-10: formas ESCRITAS que el parser de voz leía mal sin avisar. */
  it("la coma escrita es decimal", () => {
    expect(leerPaqueteDictado("20 de 1,5x7x5")).toMatchObject({ cantidad: 20, espesor: 1.5, pieTablar: 87.5 });
    expect(leerPaqueteDictado("20 de 2 x 20 x 3,20")).toMatchObject({ cantidad: 20, largo: 3.2, pieTablar: 213.33 });
  });

  it("cm y m abreviados o pegados se leen en métrico", () => {
    expect(leerPaqueteDictado("12 de 2 cm x 20 cm x 3.20 m")).toMatchObject({
      cantidad: 12, espesor: 2, ancho: 20, largo: 3.2, uEspesor: "cm", uLargo: "m", metrico: true, m3: 0.1535,
    });
    expect(leerPaqueteDictado("12 de 2cm x 20cm x 3.20m")?.m3).toBe(0.1535);
  });

  it("lo ambiguo no se carga: fracción con barra o unidades mezcladas", () => {
    expect(leerPaqueteDictado("20 de 1 1/2 x 7 x 5")).toBeNull();
    expect(leerPaqueteDictado("20 de 1/2 x 7 x 5")).toBeNull();
    expect(leerPaqueteDictado("20 de 2 pulgadas x 20 cm x 3 metros")).toBeNull();
  });

  it("la cantidad sale aunque vaya con «x» o pegada al «de»", () => {
    expect(leerPaqueteDictado("20 x 1 x 7 x 5")).toMatchObject({ cantidad: 20, pieTablar: 58.33 });
    expect(leerPaqueteDictado("20de1x7x5")).toMatchObject({ cantidad: 20, pieTablar: 58.33 });
  });
});
