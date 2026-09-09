/**
 * La sugerencia de reproceso: lo que sobra de un tipo contra lo que falta de
 * otro (ADR-404).
 *
 * Lo que se protege acá es la regla que Brandon puso como condición: **el
 * volumen nunca crece**. Un reproceso pierde madera; una sugerencia que
 * prometa más m³ de los que hay es una que hace declarar de más.
 */

import { describe, expect, it } from "vitest";
import { sugerenciasDeReproceso, resumenDeSugerencias } from "@/lib/forestal/reproceso-sugerido";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

/**
 * Piezas de 6×6×10' = **paquetería larga** (sección exacta 6×6, largo ≥ 6').
 *
 * El `m3`/`pieTablar` van precomputados como en el resto del módulo: el motor
 * reparte piezas ENTERAS leyendo esos campos, y un renglón sin ellos lo deja
 * dividiendo por `undefined` (probado: cuelga el reparto).
 */
function pieza(id: string, cantidad: number, especie = "Tornillo"): PiezaCubicada {
  const base = {
    id,
    cantidad,
    espesor: 6,
    ancho: 6,
    largo: 10,
    uEspesor: "pulg" as const,
    uAncho: "pulg" as const,
    uLargo: "pies" as const,
    especie,
  };
  const { m3, pieTablar } = cubicarPieza(base);
  return { ...base, m3, pieTablar };
}

const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id,
  especie: "Tornillo",
  m3: 0,
  origen: "manual",
  tipo: "aserrada",
  costoM3: null,
  aprovechablePct: null,
  ...o,
});

/** 80 paquetes de 6×6×10' ≈ 5.66 m³ — lo que hay que despachar. */
const PAQUETERIA: PiezaCubicada[] = [pieza("p1", 40), pieza("p2", 40)];
const M3_PAQUETERIA = PAQUETERIA.reduce((a, p) => a + (p.m3 ?? 0), 0);

/** Un bloque de COMERCIAL que sólo lleva comercial: rechaza la paquetería. */
const comercialQueNoAmpara = (m3: number) =>
  bloque({
    id: `c-${m3}`,
    etiqueta: "Saldo comercial",
    m3,
    tipoProducto: "Comercial",
    gruposFiltro: ["tipo|Comercial"],
  });

describe("motivo «faltante»: sobra un tipo y falta otro", () => {
  it("sugiere convertir, sin prometer más m³ de los que hay", () => {
    const d = distribuirPorCapacidad([comercialQueNoAmpara(3)], PAQUETERIA, "tipo");
    const s = sugerenciasDeReproceso(d).filter((x) => x.motivo === "faltante");
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({
      especie: "Tornillo",
      desdeTipo: "Comercial",
      haciaTipo: "Paquetería larga",
      disponibleM3: 3,
      convertirM3: 3,
      cubreTodo: false,
    });
    expect(s[0].convertirM3).toBeLessThanOrEqual(s[0].disponibleM3);
    expect(s[0].restaM3).toBeCloseTo(M3_PAQUETERIA - 3, 3);
    expect(s[0].sobraM3).toBe(0);
  });

  it("con más madera de la que falta, el faltante queda cubierto y sobra origen", () => {
    const s = sugerenciasDeReproceso(
      distribuirPorCapacidad([comercialQueNoAmpara(50)], PAQUETERIA, "tipo"),
    ).filter((x) => x.motivo === "faltante");
    expect(s[0].cubreTodo).toBe(true);
    expect(s[0].restaM3).toBe(0);
    expect(s[0].sobraM3).toBeGreaterThan(0);
    expect(s[0].convertirM3).toBeCloseTo(M3_PAQUETERIA, 3);
    // Lo convertido nunca supera lo disponible: el reproceso no crea madera.
    expect(s[0].convertirM3).toBeLessThan(s[0].disponibleM3);
  });

  it("no sugiere un tipo hacia sí mismo: eso es capacidad sin usar, no reproceso", () => {
    const soloPaq = bloque({
      id: "b4",
      m3: 0.2,
      gruposFiltro: ["tipo|Paquetería larga"],
      tipoProducto: "Paquetería larga",
    });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([soloPaq], PAQUETERIA, "tipo"))).toEqual([]);
  });

  it("un bloque sin tipo declarado no sugiere nada: no se adivina", () => {
    const anonimo = bloque({ id: "b5", m3: 3, gruposFiltro: ["tipo|Comercial"] , tipoProducto: null });
    /* Con «lleva sólo Comercial» el tipo SÍ se conoce; el caso sin tipo es el
       bloque que no declara ni filtro ni producto. */
    const sinNada = bloque({ id: "b6", m3: 3 });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([sinNada], PAQUETERIA, "tipo"))).toEqual([]);
    expect(
      sugerenciasDeReproceso(distribuirPorCapacidad([anonimo], PAQUETERIA, "tipo")).length,
    ).toBeGreaterThan(0);
  });

  it("no cruza especies: reprocesar tornillo no produce cachimbo", () => {
    const otra = bloque({
      id: "b7",
      m3: 3,
      especie: "Cachimbo",
      tipoProducto: "Comercial",
      gruposFiltro: ["tipo|Comercial"],
    });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([otra], PAQUETERIA, "tipo"))).toEqual([]);
  });

  it("«Lleva sólo» con dos tipos deja al bloque sin tipo: no hay de cuál sacar", () => {
    const mezcla = bloque({ id: "b8", m3: 3, gruposFiltro: ["tipo|Comercial", "tipo|Corta"] });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([mezcla], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("motivo «amparado»: el bloque ya respalda otro tipo", () => {
  it("un respaldo comercial sobre piezas de paquetería es un reproceso sin declarar", () => {
    /* Sin «lleva sólo», el reparto le da la paquetería igual: el papel diría
       que esa paquetería salió de un respaldo comercial. */
    const comercial = bloque({ id: "a1", etiqueta: "Saldo comercial", m3: 3, tipoProducto: "Comercial" });
    const s = sugerenciasDeReproceso(distribuirPorCapacidad([comercial], PAQUETERIA, "tipo"));
    const amparado = s.filter((x) => x.motivo === "amparado");
    expect(amparado.length).toBe(1);
    expect(amparado[0]).toMatchObject({
      desdeTipo: "Comercial",
      haciaTipo: "Paquetería larga",
      cubreTodo: true,
    });
    // Lo que hay que reprocesar es lo que el bloque ampara, ni más ni menos.
    expect(amparado[0].convertirM3).toBeGreaterThan(0);
    expect(amparado[0].convertirM3).toBeLessThanOrEqual(3);
  });

  it("un bloque que ampara su propio tipo no genera sugerencia", () => {
    const paq = bloque({ id: "a2", m3: 10, tipoProducto: "Paquetería larga" });
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([paq], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("el piso de lo sugerible", () => {
  it("los litros que sobran por piezas enteras no se sugieren", () => {
    /* Un bloque de 0.01 m³ libres: es el resto de la pieza que ya no entraba,
       no una orden de trabajo. */
    const migaja = comercialQueNoAmpara(0.01);
    expect(sugerenciasDeReproceso(distribuirPorCapacidad([migaja], PAQUETERIA, "tipo"))).toEqual([]);
  });
});

describe("resumenDeSugerencias", () => {
  it("no cuenta dos veces el mismo destino", () => {
    const dosOrigenes = [
      comercialQueNoAmpara(1),
      bloque({ id: "x2", m3: 1, tipoProducto: "Tabla", gruposFiltro: ["tipo|Tabla"] }),
    ];
    const s = sugerenciasDeReproceso(distribuirPorCapacidad(dosOrigenes, PAQUETERIA, "tipo")).filter(
      (x) => x.motivo === "faltante",
    );
    expect(s.length).toBe(2); // dos orígenes para el mismo destino
    const r = resumenDeSugerencias(s);
    expect(r.cuantas).toBe(2);
    expect(r.convertibleM3).toBe(s[0].convertirM3);
  });
});
