/**
 * El Variado en el papel del cubicador: cada fila 6×6 Variado se cambia por
 * sus piezas abiertas en el orden del papel, y lo que no se abre frena el
 * Anexo 04 / el envío con UNA línea que dice la causa que se arregla primero.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { VARIADO_DEFAULT, desglosarVariado } from "@/lib/forestal/variado-desglose";
import { abrirVariado, motivoSinDesglosar, paquetesVariado } from "@/components/admin/forestal/hooks/use-config-variado";

const pieza = (id: string, cantidad: number, espesor: number, ancho: number, especie: string): PiezaCubicada => {
  const base = { cantidad, espesor, ancho, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...base, especie, ...cubicarPieza(base) };
};
const bloque = (id: string, especie: string, m3: number): BloqueRolliza => ({
  id, etiqueta: id, especie, m3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null,
});

const bloques = [bloque("b1", "Tornillo", 60), bloque("b2", "Cumala", 40)];

describe("abrirVariado", () => {
  it("cambia cada fila Variado por sus piezas, en el orden del papel y sin tocar las demás", () => {
    const filas = [pieza("a", 3, 2, 4, "Tornillo"), pieza("v", 10, 6, 6, "Variado"), pieza("c", 1, 1, 6, "Cumala")];
    const des = desglosarVariado(filas, bloques, VARIADO_DEFAULT);
    const papel = abrirVariado(filas, des);
    expect(papel[0].id).toBe("a");
    expect(papel[papel.length - 1].id).toBe("c");
    const abiertas = papel.slice(1, -1);
    expect(abiertas.length).toBeGreaterThan(0);
    expect(abiertas.every((p) => p.id.startsWith("v-v-") && p.especie !== "Variado")).toBe(true);
    // El PT del paquete se conserva (redondeo de filas, no madera).
    const pt = abiertas.reduce((a, p) => a + p.pieTablar, 0);
    expect(Math.abs(pt - filas[1].pieTablar)).toBeLessThan(1);
  });

  it("con lo tildado, sólo abre las filas Variado que van al papel", () => {
    const filas = [pieza("v1", 4, 6, 6, "Variado"), pieza("v2", 4, 6, 6, "Variado")];
    const des = desglosarVariado(filas, bloques, VARIADO_DEFAULT);
    const papel = abrirVariado([filas[1]], des);
    expect(papel.every((p) => p.id.startsWith("v2-v-"))).toBe(true);
  });

  it("una fila Variado que no se abre queda tal cual", () => {
    const filas = [pieza("x", 2, 2, 4, "Variado")];
    const des = desglosarVariado(filas, bloques, VARIADO_DEFAULT);
    expect(abrirVariado(filas, des).map((p) => p.id)).toEqual(["x"]);
  });
});

describe("motivoSinDesglosar", () => {
  it("sin nada pendiente no frena", () => {
    expect(motivoSinDesglosar([])).toBeNull();
  });
  it("lo que no es 6×6 va primero: se arregla en la fila", () => {
    const m = motivoSinDesglosar([{ motivo: "sin-especies" }, { motivo: "no-6x6" }, { motivo: "no-6x6" }]);
    expect(m).toMatch(/^2 filas Variado no son 6×6/);
  });
  it("sin bloques dice dónde cargarlos", () => {
    const filas = [pieza("v", 5, 6, 6, "Variado")];
    const des = desglosarVariado(filas, [], VARIADO_DEFAULT);
    expect(motivoSinDesglosar(des.sinDesglosar)).toMatch(/Resúmenes › Distribución/);
  });
});

it("paquetesVariado cuenta sólo las filas Variado", () => {
  expect(paquetesVariado([pieza("a", 3, 2, 4, "Tornillo"), pieza("v", 12, 6, 6, "variado")])).toBe(12);
});
