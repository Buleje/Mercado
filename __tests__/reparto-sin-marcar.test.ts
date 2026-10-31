/**
 * «Sin marcar» en una sola tabla (Brandon, 2026-10-19). Lo que se protege: que
 * juntar los permisos no cambie los totales de antes (= la suma de los
 * permisos, en milésimos), que cada fila lleve su permiso y su código, y que el
 * CSV diga de qué permiso es cada medida.
 */

import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { claveMarca, distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { distConVolumenOficial } from "@/lib/forestal/reparto-oficial";
import { REGISTRO_VACIO, asignarCodigos } from "@/lib/forestal/reparto-codigos";
import { clavesDelBloque, lineasDelReparto, porDistribuir } from "@/lib/forestal/reparto-por-distribuir";
import { csvSinMarcar, tablaSinMarcar } from "@/lib/forestal/reparto-sin-marcar";

let n = 0;
function pieza(especie: string, cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const base = { id: `p${++n}`, cantidad, espesor, ancho, largo, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const, especie };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}
const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id, especie: "Tornillo", m3: 400, origen: "manual", costoM3: null, aprovechablePct: 60, ...o,
});

const PIEZAS = [
  pieza("Tornillo", 3, 2, 8, 10), pieza("Tornillo", 2, 2, 4, 4), pieza("Tornillo", 7, 2, 3, 10), pieza("Tornillo", 5, 3, 4, 12),
  pieza("Cumala", 9, 2, 8, 10), pieza("Cumala", 4, 2, 4, 4),
  pieza("Capirona", 2, 2, 8, 10), pieza("Capirona", 1, 2, 3, 2), pieza("Capirona", 1, 3, 4, 3),
];
const B = [
  bloque({ id: "b1", etiqueta: "Bloque 1", especie: "Tornillo", permiso: "PLT-2021-017" }),
  bloque({ id: "b2", etiqueta: "Bloque 2", especie: "Cumala", permiso: "PLT-2025-096" }),
  bloque({ id: "b3", etiqueta: "Bloque 3", especie: "Capirona", permiso: "PLT-2025-167" }),
];
const DIST = distribuirPorCapacidad(B, PIEZAS, "tipo");
const VISTA = distConVolumenOficial(DIST);
const REG = asignarCodigos(REGISTRO_VACIO, B.map((b) => b.id), lineasDelReparto(DIST));
const codigoDe = (k: string) => REG.lineas[k] ?? null;

/* Sólo se tilda la Comercial del bloque 2: lo demás queda sin marcar, en 3 permisos. */
const comercialB2 = () => {
  const b2 = VISTA.especies.flatMap((e) => e.bloques).find((b) => b.bloque.id === "b2")!;
  const g = b2.porDia[0].grupos.find((x) => /comercial/i.test(x.label))!;
  return claveMarca("b2", 1, g.clave);
};
const MARCADAS = new Set([comercialB2()]);

describe("tablaSinMarcar", () => {
  const pd = porDistribuir(VISTA, MARCADAS);
  const t = tablaSinMarcar(pd, codigoDe);

  it("hay líneas de más de un permiso en la misma tabla", () => {
    expect(new Set(t.filas.map((f) => f.permisoLabel)).size).toBeGreaterThan(1);
    expect(t.filas.length).toBe(pd.lineas.length);
  });

  it("los totales son los de antes y la suma de los permisos, exacta", () => {
    expect(t.totales).toEqual(pd.totales);
    const suma = t.porPermiso.reduce(
      (a, p) => ({ piezas: a.piezas + p.totales.piezas, m3: a.m3 + Math.round(p.totales.m3 * 1000), pt: a.pt + p.totales.pt }),
      { piezas: 0, m3: 0, pt: 0 },
    );
    expect(suma.piezas).toBe(t.totales.piezas);
    expect(suma.m3).toBe(Math.round(t.totales.m3 * 1000));
    expect(suma.pt).toBeCloseTo(t.totales.pt, 2);
  });

  it("va ordenada por código y cada fila trae el suyo", () => {
    const codigos = t.filas.map((f) => f.codigo);
    expect(codigos.every(Boolean)).toBe(true);
    expect(codigos).toEqual([...codigos].sort((a, b) => (a! < b! ? -1 : 1)));
    expect(t.filas.some((f) => f.clave === comercialB2())).toBe(false);
  });

  it("el código no cambia al tildar más líneas", () => {
    const antes = new Map(t.filas.map((f) => [f.clave, f.codigo]));
    const masMarcas = new Set([...MARCADAS, t.filas[0].clave]);
    const t2 = tablaSinMarcar(porDistribuir(VISTA, masMarcas), codigoDe);
    for (const f of t2.filas) expect(f.codigo).toBe(antes.get(f.clave));
  });

  it("el CSV trae Permiso y Código en cada medida, y el total de la tabla", () => {
    const csv = csvSinMarcar(t).replace(/^﻿/, "").split("\n");
    expect(csv[0]).toBe("Código,Permiso,Bloque,Especie,Día,Tipo,Medida,Piezas,m³,Pie tablar");
    const cuerpo = csv.slice(1, -1);
    expect(cuerpo.length).toBeGreaterThanOrEqual(t.filas.length);
    for (const fila of cuerpo) expect(fila).toMatch(/^\d+-\d{2},PLT-/);
    const piezasCsv = cuerpo.reduce((a, f) => a + Number(f.split(",")[7]), 0);
    expect(piezasCsv).toBe(t.totales.piezas);
    expect(csv.at(-1)).toBe(`Total,,,,,,,${t.totales.piezas},${t.totales.m3.toFixed(3)},${Math.round(t.totales.pt * 100) / 100}`);
  });

  it("todo tildado = tabla vacía", () => {
    const todas = new Set(VISTA.especies.flatMap((e) => e.bloques).flatMap((b) => clavesDelBloque(b)));
    expect(tablaSinMarcar(porDistribuir(VISTA, todas), codigoDe).filas).toEqual([]);
  });
});
