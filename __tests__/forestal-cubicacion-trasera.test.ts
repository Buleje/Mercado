/** La trasera del camión viaja con la cubicación guardada (Brandon, 2026-10-03). */
import { describe, expect, it } from "vitest";
import { construirRegistro, normalizarTrasera } from "@/lib/forestal/cubicacion-registro";
import { ANCHO_CAMION_M_DEFAULT, ANCHO_CAMION_M_MAX } from "@/lib/forestal/camion-croquis";

const piezas = [
  { id: "a", cantidad: 2, espesor: 2, ancho: 8, largo: 10 },
  { id: "b", cantidad: 1, espesor: 2, ancho: 6, largo: 8 },
];

describe("normalizarTrasera", () => {
  it("descarta ids que no están entre las piezas y repetidos, sin error", () => {
    expect(normalizarTrasera({ ids: ["a", "zzz", "a"], anchoM: 2.8 }, piezas)).toEqual({ ids: ["a"], anchoM: 2.8 });
  });
  it("sin ids y con el ancho de fábrica no guarda nada", () => {
    expect(normalizarTrasera({ ids: ["zzz"], anchoM: ANCHO_CAMION_M_DEFAULT }, piezas)).toBeUndefined();
  });
  it("sin ids pero con otro ancho conserva el ancho", () => {
    expect(normalizarTrasera({ ids: [], anchoM: 3 }, piezas)).toEqual({ ids: [], anchoM: 3 });
  });
  it("acota el ancho al rango", () => {
    expect(normalizarTrasera({ ids: ["a"], anchoM: 99 }, piezas)?.anchoM).toBe(ANCHO_CAMION_M_MAX);
  });
  it("ausente = sin trasera", () => {
    expect(normalizarTrasera(undefined, piezas)).toBeUndefined();
  });
});

describe("construirRegistro con trasera", () => {
  it("la guarda filtrada y las viejas (sin el campo) quedan sin trasera", () => {
    expect(construirRegistro({ nombre: "x", piezas, trasera: { ids: ["b", "q"], anchoM: 2.6 } }).trasera).toEqual({ ids: ["b"], anchoM: 2.6 });
    expect(construirRegistro({ nombre: "x", piezas }).trasera).toBeUndefined();
  });
});
