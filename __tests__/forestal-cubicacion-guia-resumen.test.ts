/**
 * «Sin GTF» y «Rinde» de Guardadas (Cubicador, 24-10).
 * Protege: la comunidad con 2 guardadas de la MISMA guía cuenta la troza una vez;
 * la guardada sin GTF no suma; la guía de aserrada no cuenta; la especie que la
 * guía no trae no sube el rendimiento; troza 0 → sin dato.
 */
import { describe, expect, it } from "vitest";
import { construirRegistro, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { clasificar } from "@/lib/forestal/cubicacion-por-ficha";
import { numerosDeGuia, rendimientoPorFicha, resumenSinGuia } from "@/lib/forestal/cubicacion-guia-resumen";
import { claveNumeroGtf } from "@/lib/forestal/gtf-talonario";
import type { VolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";

const g = (id: string, comunidad: string, gtfNumber: string | undefined, piezas: Array<{ cantidad: number; especie: string }>): CubicacionRegistro => ({
  ...construirRegistro({
    nombre: id,
    gtfNumber,
    ficha: { comunidad },
    piezas: piezas.map((p, i) => ({ id: `${id}-${i}`, cantidad: p.cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie: p.especie })),
  }),
  id,
});

const troza = (m3Total: number, especie = "Tornillo"): VolumenDeGuia => ({ tipo: "trozas", m3Total, volumenPorEspecie: [{ especie, m3: m3Total, piezas: 5 }] });
const mapa = (o: Record<string, VolumenDeGuia>) => new Map(Object.entries(o).map(([k, v]) => [claveNumeroGtf(k) as string, v]));

describe("resumenSinGuia", () => {
  it("cuenta y suma el PT de las que no tienen GTF", () => {
    const a = g("a", "X", undefined, [{ cantidad: 10, especie: "Tornillo" }]);
    const b = g("b", "X", "  ", [{ cantidad: 5, especie: "Tornillo" }]);
    const c = g("c", "X", "001-0000120", [{ cantidad: 5, especie: "Tornillo" }]);
    const r = resumenSinGuia([a, b, c]);
    expect(r.ids).toEqual(["a", "b"]);
    expect(r.cantidad).toBe(2);
    expect(r.pieTablar).toBeCloseTo(a.totales.pieTablar + b.totales.pieTablar, 2);
  });
});

describe("numerosDeGuia", () => {
  it("la misma guía escrita distinto va una sola vez", () => {
    const l = [g("a", "X", "001-0000120", []), g("b", "X", "1-120", []), g("c", "X", undefined, [])];
    expect(numerosDeGuia(l)).toHaveLength(1);
  });
});

describe("rendimientoPorFicha", () => {
  const a = g("a", "San Luis", "001-0000120", [{ cantidad: 10, especie: "Tornillo" }]);
  const b = g("b", "San Luis", "001-0000120", [{ cantidad: 10, especie: "Tornillo" }, { cantidad: 10, especie: "Cedro" }]);
  const c = g("c", "San Luis", undefined, [{ cantidad: 50, especie: "Tornillo" }]);
  const lista = [a, b, c];
  const claves = clasificar(lista, "comunidad");
  const k = claves.get("a")?.clave as string;

  it("2 guardadas de la misma guía: la troza cuenta una vez; el Cedro que la guía no trae y la sin GTF no suben el %", () => {
    const r = rendimientoPorFicha(lista, claves, mapa({ "001-0000120": troza(10) })).get(k);
    expect(r?.guias).toBe(1);
    expect(r?.m3Troza).toBe(10);
    /* a: todo Tornillo; b: sólo su mitad Tornillo (mismas medidas) = a.PT/2·... */
    const mitadB = b.totales.pieTablar / 2;
    expect(r?.m3Aserrado).toBeCloseTo((a.totales.pieTablar + mitadB) / 424, 3);
    expect(r?.pct).toBeCloseTo(((a.totales.pieTablar + mitadB) / 424 / 10) * 100, 1);
  });

  it("guía de madera aserrada no cuenta; sin guía leída no hay dato", () => {
    const producto: VolumenDeGuia = { ...troza(10), tipo: "producto" };
    expect(rendimientoPorFicha(lista, claves, mapa({ "001-0000120": producto })).size).toBe(0);
    expect(rendimientoPorFicha(lista, claves, new Map()).size).toBe(0);
  });

  it("m³ de troza 0 → pct null", () => {
    const r = rendimientoPorFicha(lista, claves, mapa({ "001-0000120": troza(0) })).get(k);
    expect(r?.pct).toBeNull();
    expect(r?.veredicto).toBeNull();
  });

  it("dos guías distintas suman sus trozas", () => {
    const d = g("d", "San Luis", "001-0000121", [{ cantidad: 10, especie: "Tornillo" }]);
    const l = [a, d];
    const r = rendimientoPorFicha(l, clasificar(l, "comunidad"), mapa({ "001-0000120": troza(4), "001-0000121": troza(6) })).get(k);
    expect(r?.m3Troza).toBe(10);
    expect(r?.guias).toBe(2);
  });
});
