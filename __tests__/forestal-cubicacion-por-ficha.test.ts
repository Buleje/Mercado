/**
 * «Cuánto salió de cada comunidad / comprador» (Guardadas, 24-10).
 * Protege: mayúsculas y espacios no parten una comunidad; el nombre sin id se
 * suma al del mismo nombre con id; las viejas caen en «Sin …»; el m³ sale del
 * PT total ÷ 424 y el valor es el congelado.
 */
import { describe, expect, it } from "vitest";
import { construirRegistro, type CubicacionRegistro, type FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import { agruparPorFicha, deLaFila, totalDeFilas } from "@/lib/forestal/cubicacion-por-ficha";

const g = (id: string, cantidad: number, opts: { cliente?: string; ficha?: FichaCubicacion; precioPt?: number } = {}): CubicacionRegistro => ({
  ...construirRegistro({
    nombre: id,
    cliente: opts.cliente,
    ficha: opts.ficha,
    precioPt: opts.precioPt ?? 2,
    piezas: [{ id: `${id}-1`, cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: "Tornillo" }],
  }),
  id,
});

describe("agruparPorFicha · comunidad", () => {
  const lista = [
    g("a", 10, { ficha: { comunidad: "Comunidad Nativa San Luis" } }),
    g("b", 20, { ficha: { comunidad: "  COMUNIDAD NATIVA   SAN LUIS " } }),
    g("c", 5, { ficha: { comunidad: "Nueva Esperanza", comunidadParteId: "p1" } }),
    g("d", 5, { ficha: { comunidad: "nueva esperanza" } }),
    g("e", 1),
  ];
  const filas = agruparPorFicha(lista, "comunidad");

  it("mayúsculas y espacios son la misma comunidad; el nombre sin id se suma al que tiene id", () => {
    expect(filas.map((f) => [f.etiqueta, f.cubicaciones])).toEqual([["Comunidad Nativa San Luis", 2], ["Nueva Esperanza", 2], ["Sin comunidad", 1]]);
  });

  it("suma lo guardado y el m³ sale del PT total ÷ 424", () => {
    const san = filas[0];
    const pt = lista[0].totales.pieTablar + lista[1].totales.pieTablar;
    expect(san.pieTablar).toBeCloseTo(pt, 2);
    expect(san.m3).toBeCloseTo(pt / 424, 3);
    expect(san.valor).toBeCloseTo(lista[0].valor + lista[1].valor, 2);
    expect(san.piezas).toBe(30);
  });

  it("«Sin comunidad» va al final y deLaFila devuelve sus cubicaciones", () => {
    expect(filas.at(-1)?.sin).toBe(true);
    expect(deLaFila(lista, "comunidad", filas.at(-1)!.clave).map((c) => c.id)).toEqual(["e"]);
    expect(deLaFila(lista, "comunidad", filas[1].clave).map((c) => c.id)).toEqual(["c", "d"]);
  });

  it("el total de abajo cuadra con la suma de las filas", () => {
    const t = totalDeFilas(filas);
    expect(t.cubicaciones).toBe(5);
    expect(t.pieTablar).toBeCloseTo(lista.reduce((a, c) => a + c.totales.pieTablar, 0), 2);
  });
});

describe("agruparPorFicha · comprador", () => {
  it("usa cliente; por id si lo hay", () => {
    const filas = agruparPorFicha([
      g("a", 1, { cliente: "Pérez", ficha: { clienteParteId: "x" } }),
      g("b", 1, { cliente: "perez" }),
      g("c", 1),
    ], "comprador");
    expect(filas.map((f) => [f.etiqueta, f.cubicaciones])).toEqual([["Pérez", 2], ["Sin comprador", 1]]);
  });

  it("lista vacía → sin filas", () => {
    expect(agruparPorFicha([], "comprador")).toEqual([]);
  });
});
