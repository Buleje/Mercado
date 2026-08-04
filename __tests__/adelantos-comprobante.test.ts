import { describe, expect, it } from "vitest";
import { montoEnLetras } from "@/lib/adelantos/comprobante";

/**
 * El monto en letras es lo que impide que a un recibo firmado se le agregue un
 * cero. Si esto se equivoca, el papel dice una cosa y el sistema otra — y el
 * papel es el que está firmado.
 */
describe("monto en letras", () => {
  it("escribe las unidades y los centavos", () => {
    expect(montoEnLetras(1)).toBe("uno con 00/100");
    expect(montoEnLetras(15.5)).toBe("quince con 50/100");
    expect(montoEnLetras(0)).toBe("cero con 00/100");
  });

  /** «veinte y uno» no existe: es veintiuno, y de 30 para arriba sí lleva «y». */
  it("resuelve el quiebre del veinte", () => {
    expect(montoEnLetras(21)).toBe("veintiuno con 00/100");
    expect(montoEnLetras(25)).toBe("veinticinco con 00/100");
    expect(montoEnLetras(31)).toBe("treinta y uno con 00/100");
  });

  /** 100 es «cien»; 101 en adelante, «ciento». */
  it("distingue cien de ciento", () => {
    expect(montoEnLetras(100)).toBe("cien con 00/100");
    expect(montoEnLetras(101)).toBe("ciento uno con 00/100");
    expect(montoEnLetras(500)).toBe("quinientos con 00/100");
  });

  it("los miles: «mil», no «uno mil»", () => {
    expect(montoEnLetras(1000)).toBe("mil con 00/100");
    expect(montoEnLetras(1500)).toBe("mil quinientos con 00/100");
    expect(montoEnLetras(2000)).toBe("dos mil con 00/100");
    expect(montoEnLetras(12345)).toBe("doce mil trescientos cuarenta y cinco con 00/100");
  });

  it("redondea los centavos como el dinero, no como el float", () => {
    expect(montoEnLetras(0.1 + 0.2)).toBe("cero con 30/100");
    // Los centavos ACARREAN: 99.999 es cien, no «noventa y nueve con 100/100».
    expect(montoEnLetras(99.999)).toBe("cien con 00/100");
    expect(montoEnLetras(0.999)).toBe("uno con 00/100");
  });

  /**
   * Arriba del rango cubierto devuelve el número: mejor un dígito que una
   * conversión a medias en un papel que se firma.
   */
  it("no inventa arriba de 999.999", () => {
    expect(montoEnLetras(1_000_000)).toBe("1000000");
  });
});
