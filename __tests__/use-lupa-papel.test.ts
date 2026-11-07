import { describe, expect, it } from "vitest";
import { escalaDelModo, normalizarModo, pasoSiguiente } from "@/hooks/use-lupa-papel";

/* La lupa de «Datos de la GTF» (16-10): lo guardado, los escalones y los dos ajustes. */
describe("lupa del papel", () => {
  it("lo guardado en localStorage se sanea: modos, % dentro de 50-200 y basura → inicial", () => {
    expect(normalizarModo("completa", "ancho")).toBe("completa");
    expect(normalizarModo(125, "ancho")).toBe(125);
    expect(normalizarModo(400, "ancho")).toBe(200);
    expect(normalizarModo(10, "ancho")).toBe(50);
    expect(normalizarModo("zoom", "ancho")).toBe("ancho");
    expect(normalizarModo(Number.NaN, "completa")).toBe("completa");
    expect(normalizarModo(null, "ancho")).toBe("ancho");
  });

  it("los escalones: desde un ajuste fuera de la lista va al escalón vecino; en la punta, null", () => {
    expect(pasoSiguiente(100, 1)).toBe(110);
    expect(pasoSiguiente(100, -1)).toBe(90);
    expect(pasoSiguiente(37, 1)).toBe(50);
    expect(pasoSiguiente(37, -1)).toBeNull();
    expect(pasoSiguiente(200, 1)).toBeNull();
    expect(pasoSiguiente(131, -1)).toBe(125);
  });

  it("«ancho» llena el visor; «completa» = que entre a lo ancho Y a lo alto", () => {
    const m = { anchoVisible: 1180, altoVisible: 600, anchoHoja: 1180, altoHoja: 1672 };
    expect(escalaDelModo("ancho", m)).toBe(1);
    expect(escalaDelModo("completa", m)).toBeCloseTo(600 / 1672, 5);
    /* Una lista corta: entra a lo alto de sobra, manda el ancho (no se agranda más que el visor). */
    expect(escalaDelModo("completa", { ...m, altoHoja: 424 })).toBe(1);
    /* Pantalla ancha: la hoja no se estira, se agranda. */
    expect(escalaDelModo("ancho", { ...m, anchoVisible: 1770 })).toBeCloseTo(1.5, 5);
    expect(escalaDelModo(75, m)).toBe(0.75);
    expect(escalaDelModo("completa", null)).toBe(1);
    /* Una guía enorme no baja de 20 %. */
    expect(escalaDelModo("completa", { ...m, altoHoja: 100000 })).toBe(0.2);
  });
});
