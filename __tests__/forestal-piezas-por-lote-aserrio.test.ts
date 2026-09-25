import { describe, expect, it } from "vitest";
import {
  agruparPiezasPorLoteAserrio,
  type PiezaConsumida,
} from "@/lib/forestal/lotes-aserrio";

const pieza = (over: Partial<PiezaConsumida> = {}): PiezaConsumida => ({
  codificacion: "20/A",
  codigoPlanta: null,
  volumenM3: 2.043,
  loteAserrioCode: "LA-2026-003",
  ...over,
});

describe("agruparPiezasPorLoteAserrio", () => {
  it("sin piezas no inventa filas", () => {
    expect(agruparPiezasPorLoteAserrio([])).toEqual([]);
  });

  it("agrupa por lote y suma piezas y volumen", () => {
    const r = agruparPiezasPorLoteAserrio([
      pieza({ codificacion: "20/A", volumenM3: 2.043 }),
      pieza({ codificacion: "117/B", volumenM3: 2.118 }),
      pieza({ codificacion: "84/A", volumenM3: 4.681, loteAserrioCode: "LA-2026-001" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ code: "LA-2026-001", piezas: 1, volumenM3: 4.681 });
    expect(r[1]).toMatchObject({ code: "LA-2026-003", piezas: 2, volumenM3: 4.161 });
  });

  it("el código que vale es el de PLANTA — es el que está pintado en el palo", () => {
    const [f] = agruparPiezasPorLoteAserrio([pieza({ codificacion: "20/A", codigoPlanta: "0042" })]);
    expect(f.codigos).toEqual(["0042"]);
  });

  it("sin marca de planta cae a la codificación de la guía", () => {
    const [f] = agruparPiezasPorLoteAserrio([pieza({ codigoPlanta: null })]);
    expect(f.codigos).toEqual(["20/A"]);
  });

  it("una pieza sin ningún código cuenta igual, pero no aporta código", () => {
    const [f] = agruparPiezasPorLoteAserrio([pieza({ codificacion: null, codigoPlanta: null })]);
    expect(f.piezas).toBe(1);
    expect(f.codigos).toEqual([]);
  });

  it("las piezas SIN lote no se descartan: el conteo del certificado tiene que cerrar", () => {
    const r = agruparPiezasPorLoteAserrio([
      pieza({ loteAserrioCode: null, volumenM3: 3.3 }),
      pieza({ loteAserrioCode: null, volumenM3: 1.7 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: null, piezas: 2, volumenM3: 5 });
  });

  it("el grupo «sin lote» va ÚLTIMO: es la excepción, no el encabezado", () => {
    const r = agruparPiezasPorLoteAserrio([
      pieza({ loteAserrioCode: null }),
      pieza({ loteAserrioCode: "LA-2026-009" }),
      pieza({ loteAserrioCode: "LA-2026-002" }),
    ]);
    expect(r.map((x) => x.code)).toEqual(["LA-2026-002", "LA-2026-009", null]);
  });

  it("una pieza sin volumen suma cero, no NaN", () => {
    const [f] = agruparPiezasPorLoteAserrio([pieza({ volumenM3: null }), pieza({ volumenM3: 2 })]);
    expect(f.volumenM3).toBe(2);
    expect(f.piezas).toBe(2);
  });

  it("el volumen se redondea a la precisión del libro (4 decimales)", () => {
    const [f] = agruparPiezasPorLoteAserrio([pieza({ volumenM3: 0.1 }), pieza({ volumenM3: 0.2 })]);
    expect(f.volumenM3).toBe(0.3);
  });
});
