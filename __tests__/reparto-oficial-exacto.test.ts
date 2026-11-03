/**
 * ADR-531 (Brandon 2026-11-03): «en pestaña cubicador de madera sale normal ese
 * volumen de 23.807 pero en resúmenes sale 23.810, también en distribución …
 * que todo cuadre». El motor del reparto lleva el m³ de cada asignación como
 * «piezas × m³ de una pieza redondeado»; lo OFICIAL (Distribución y las filas
 * que usa Resúmenes) sale del PT exacto de las medidas, igual que el cubicador.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { agruparOficial } from "@/lib/forestal/cubicacion-resumen";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { repartoOficial } from "@/lib/forestal/reparto-oficial";
import { agruparPiezasIguales } from "@/lib/forestal/variado-desglose";

/* Las 670 piezas de la carga de Rivers (03-11), «espesor×ancho×largo:piezas». */
const RIVERS = "3x9x10:18 3x8x10:21 2x6x10:32 2x7x10:57 3x6x10:5 2x8x10:33 2x10x10:12 2x9x10:19 3x7x10:19 4x9x10:10 3x11x10:5 3x13x10:4 2x12x10:4 3x10x10:17 4x12x10:4 4x8x9:1 4x7x9:2 3x12x10:2 4x10x9:2 3x8x9:2 2x8x9:4 2x9x9:3 3x14x10:3 2x7x9:3 4x13x9:1 3x7x8:9 2x13x10:2 2x11x10:4 4x8x10:6 4x11x10:4 4x10x10:3 4x13x10:2 2x10x9:1 3x9x8:6 2x7x8:25 2x6x8:14 3x8x8:8 3x6x8:6 3x10x8:4 2x12x8:3 2x10x8:10 4x11x8:2 2x13x8:1 2x9x8:6 2x8x8:28 4x12x8:2 4x9x8:1 2x7x7:17 2x8x7:25 2x9x7:8 3x9x7:5 3x8x7:7 3x12x7:2 2x6x7:11 2x14x7:2 3x10x7:4 2x12x7:1 2x10x7:3 3x13x7:1 3x7x7:5 4x8x7:1 4x10x7:1 2x7x6:8 2x8x6:24 2x10x6:4 3x9x6:3 3x14x7:1 3x8x6:5 3x11x6:1 2x6x6:5 3x7x6:2 2x12x6:1 4x6x6:3 2x9x6:8 3x6x7:2 2x11x7:1 4x6x8:3 4x9x6:1 4x10x6:4 2x14x6:1 4x5x9:1 3x5x10:2 5x5x8:1 3x5x7:1 2x5x7:1 4x4x7:1 4x5x7:3 2x5x6:1 3x16x10:1 3x17x10:2 2x11x8:3 4x13x8:2 6x7x10:1 2x5x10:1 2x11x6:1 3x14x6:1 3x6x6:1 4x7x6:1 3x13x6:1 3x10x6:1 3x11x7:1 4x14x7:1 4x6x7:1 3x11x8:3 3x13x8:1 4x8x8:2 4x12x9:1 2x6x9:1 3x7x9:1 3x9x9:3 2x14x9:1 4x6x10:2 4x14x10:1 2x16x10:1 4x20x10:1 4x17x10:1 2x9x2:1 3x10x2:1 4x7x2:1 2x10x2:1 2x8x2:1 4x8x3:1 3x7x3:1 2x13x3:1 4x7x3:1 4x10x3:1 2x9x4:1 2x8x4:2 1x8x4:1 3x15x4:1 2x9x5:1 2x7x5:1 2x8x5:1 3x10x5:1 1x10x5:1 2x13x5:1";
const rows: PiezaCubicada[] = RIVERS.split(" ").flatMap((t, i) => {
  const [medida, n] = t.split(":");
  const [e, a, l] = medida.split("x").map(Number);
  return Array.from({ length: Number(n) }, (_, k) => {
    const base = { cantidad: 1, espesor: e, ancho: a, largo: l, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
    return { id: `p${i}-${k}`, ...base, especie: "Tornillo", ...cubicarPieza(base) };
  });
});
const bloque = (id: string, m3: number): BloqueRolliza => ({
  id, etiqueta: id, especie: "Tornillo", m3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null,
});

describe("ADR-531: Distribución y Resúmenes dicen lo mismo que el cubicador", () => {
  it.each([
    ["un bloque que alcanza", [bloque("b1", 60)]],
    ["dos bloques y falta", [bloque("b1", 20), bloque("b2", 15)]],
  ] as const)("%s", (_n, bloques) => {
    const cubicador = agruparOficial(rows, "especie").total.m3;
    expect(cubicador).toBe(23.807); // 10.094 pt ÷ 424
    const oficial = repartoOficial(distribuirPorCapacidad([...bloques], agruparPiezasIguales(rows), "tipo"));
    expect(oficial.total).toBe(cubicador);
    expect(agruparOficial(rows, "especie", 0, oficial.porFila).total.m3).toBe(cubicador);
  });
});
