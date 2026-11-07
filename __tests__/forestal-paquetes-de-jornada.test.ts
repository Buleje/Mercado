/**
 * paquetesDeGrupos: las medidas del paquete van en cm y m, como las guarda el
 * Libro (prueba del Recorrido del permiso, 27-10). La cubicación las trae en
 * SUS unidades —pulgadas y pies casi siempre— y pasaban tal cual: un 2"×8"×10'
 * quedó como «2 cm × 8 cm × 10 m» en PQ-2609-031.
 */
import { describe, expect, it } from "vitest";
import { medidasDelPaquete, paquetesDeGrupos } from "@/lib/forestal/paquetes-de-jornada";
import type { AsignacionGrupo, AsignacionMedida } from "@/lib/forestal/cubicacion-reparto";

const medida = (x: Partial<AsignacionMedida> = {}): AsignacionMedida => ({
  clave: "2x8x10",
  medida: "2×8×10",
  espesor: 2,
  ancho: 8,
  largo: 10,
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  m3: 0.0629,
  pieTablar: 13.33,
  piezas: 1,
  ...x,
});

const grupo = (medidas: AsignacionMedida[]): AsignacionGrupo =>
  ({ clave: "comercial", label: "Comercial", m3: 0.0629, pieTablar: 13.33, piezas: 1, medidas }) as AsignacionGrupo;

describe("medidas del paquete en cm y m", () => {
  it('2"×8"×10\' → 5,08 cm × 20,32 cm × 3,05 m (3,048 redondeado a 2 decimales, como lo guarda la base)', () => {
    expect(medidasDelPaquete(medida())).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05 });
    const [p] = paquetesDeGrupos([grupo([medida()])], "2026-10-27", [], []);
    expect(p).toMatchObject({ espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, cantidad: 1, volumenM3: 0.0629 });
  });

  it("ya en cm y m → sin cambio", () => {
    expect(medidasDelPaquete(medida({ espesor: 5, ancho: 20, largo: 3.2, uEspesor: "cm", uAncho: "cm", uLargo: "m" }))).toEqual({
      espesorCm: 5,
      anchoCm: 20,
      largoM: 3.2,
    });
  });

  it("sin medidas, o con una unidad desconocida → null (no se adivina)", () => {
    expect(medidasDelPaquete(undefined)).toEqual({ espesorCm: null, anchoCm: null, largoM: null });
    expect(medidasDelPaquete(medida({ uLargo: "varas" }))).toMatchObject({ espesorCm: 5.08, largoM: null });
    const [p] = paquetesDeGrupos([grupo([])], "2026-10-27", [], []);
    expect(p).toMatchObject({ espesorCm: null, anchoCm: null, largoM: null });
  });
});
