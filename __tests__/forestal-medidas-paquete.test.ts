import { describe, it, expect } from "vitest";
import { medidasDeTexto } from "@/lib/forestal/medidas-paquete";

/**
 * Las dimensiones del inventario de aserrada vienen en una celda de texto y
 * cada aserradero la escribe distinto. Lo que NO puede pasar es que un
 * `0 X 0 X 0` se lea como un paquete de cero centímetros: eso llegaría a la
 * lista de productos como una medida declarada.
 */
describe("medidasDeTexto", () => {
  it("lee espesor y ancho (dos números, como los escribe el SNIFFS)", () => {
    expect(medidasDeTexto("5.08 X 20.32")).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: null });
  });

  it("lee los tres cuando el largo viene", () => {
    expect(medidasDeTexto("2 X 8 X 3.05")).toEqual({ espesorCm: 2, anchoCm: 8, largoM: 3.05 });
  });

  it("acepta la x minúscula, el asterisco y el signo ×", () => {
    expect(medidasDeTexto("2x8")).toEqual({ espesorCm: 2, anchoCm: 8, largoM: null });
    expect(medidasDeTexto("2*8")).toEqual({ espesorCm: 2, anchoCm: 8, largoM: null });
    expect(medidasDeTexto("2 × 8")).toEqual({ espesorCm: 2, anchoCm: 8, largoM: null });
  });

  it("acepta coma decimal", () => {
    expect(medidasDeTexto("5,08 X 20,32")).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: null });
  });

  it("ignora las unidades pegadas", () => {
    expect(medidasDeTexto("5.08 cm X 20.32 cm")).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: null });
  });

  it("«0 X 0 X 0» es «sin medidas», no un paquete de cero", () => {
    expect(medidasDeTexto("0 X 0 X 0")).toBeNull();
    expect(medidasDeTexto("0 X 0")).toBeNull();
  });

  it("devuelve null cuando no hay nada que leer", () => {
    expect(medidasDeTexto("")).toBeNull();
    expect(medidasDeTexto(null)).toBeNull();
    expect(medidasDeTexto(undefined)).toBeNull();
    expect(medidasDeTexto("-")).toBeNull();
    expect(medidasDeTexto("PIEZAS")).toBeNull();
  });

  it("con un solo número no alcanza: no se adivina cuál es", () => {
    expect(medidasDeTexto("5.08")).toBeNull();
  });

  it("un cero suelto entre medidas reales no inventa el dato", () => {
    expect(medidasDeTexto("5.08 X 20.32 X 0")).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: null });
  });
});
