/**
 * __tests__/forestal-codigo-de-troza-no-afecta.test.ts
 *
 * «Ojo, esto no afectará, sólo es interno para ese producir sin lote» (Brandon,
 * 2026-09-14). El código de la troza viaja pegado a cada pieza del cubicado,
 * pero lo que se DECLARA —los paquetes— tiene que salir idéntico con códigos o
 * sin ellos: los paquetes agrupan por medida/especie/tipo/dueño y nada más.
 */
import { describe, expect, it } from "vitest";
import { unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { sinCodigoDeTroza } from "@/lib/forestal/codigo-de-troza";

const pieza = (id: string, codigo?: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada => ({
  id,
  cantidad: 10,
  espesor: 2,
  ancho: 8,
  largo: 10,
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  especie: "Tornillo",
  pieTablar: 133.33,
  m3: 0.3145,
  ...(codigo ? { codigo } : {}),
  ...extra,
});

const corta = (id: string, codigo?: string) =>
  pieza(id, codigo, { espesor: 1, ancho: 6, largo: 8, cantidad: 4, pieTablar: 16, m3: 0.0377 });

describe("el código de la troza no cambia lo que se declara", () => {
  it("unificarPorMedida junta en UNA fila dos piezas iguales con códigos distintos", () => {
    const r = unificarPorMedida([pieza("a", "25"), pieza("b", "17")]);
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(20);
    expect(r[0].pieTablar).toBeCloseTo(266.66, 2);
  });

  it("la fila unificada no se queda con el código de la primera pieza", () => {
    const [fila] = unificarPorMedida([pieza("a", "25"), pieza("b", "17")]);
    expect(fila).not.toHaveProperty("codigo");
  });

  it("con o sin códigos, unificarPorMedida da las mismas filas", () => {
    const sin = unificarPorMedida([pieza("a"), pieza("b"), corta("c")]);
    const con = unificarPorMedida([pieza("a", "25"), pieza("b", "17"), corta("c", "5")]);
    expect(con).toEqual(sin);
  });

  it("paquetesDeLoCubicado arma exactamente los mismos paquetes", async () => {
    const { paquetesDeLoCubicado } = await import("@/components/admin/forestal/CtpProducirSinLoteModal");
    const opts = { codigosEnPlanta: ["PQ-2609-004"], hoy: new Date("2026-09-14T12:00:00Z") };
    const sin = paquetesDeLoCubicado([pieza("a"), pieza("b"), corta("c")], opts);
    const con = paquetesDeLoCubicado([pieza("a", "25"), pieza("b", "17"), corta("c", "5")], opts);
    expect(con).toEqual(sin);
    expect(con).toHaveLength(2);
    /* El código de cada paquete sale de la serie de la planta, nunca de la troza. */
    expect(con.map((p) => p.codigo)).toEqual(["PQ-2609-005", "PQ-2609-006"]);
    expect(con.map((p) => p.cantidad)).toEqual([20, 4]);
  });

  it("lo que se sube al servidor no lleva el código", () => {
    const subidas = [pieza("a", "25"), corta("c")].map(sinCodigoDeTroza);
    expect(JSON.stringify(subidas)).not.toContain("codigo");
  });
});
