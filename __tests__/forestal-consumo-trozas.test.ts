import { describe, it, expect } from "vitest";
import {
  agruparPorGuia,
  avisosSeleccion,
  estaDisponible,
  filtrarTrozas,
  motivoBloqueo,
  totalesSeleccion,
  type TrozaConsumible,
} from "@/lib/forestal/consumo-trozas";

/**
 * ADR-326 — elegir QUÉ PIEZAS entran a la sierra.
 *
 * El consumo del libro sigue siendo m³ por guía (ahí viven I1-I6). Lo que se
 * testea acá es lo que decide qué se puede tildar y cómo se deriva el volumen:
 * un fiscalizador no cuenta metros cúbicos abstractos, cuenta piezas.
 */

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t1",
  woodEntryId: "w1",
  codificacion: "52/A",
  codigoPlanta: "118",
  especieComun: "Tornillo",
  volumenM3: 3,
  gtfNumber: "001-0000120",
  proveedor: "Maderera El Aguajal SAC",
  ...over,
});

describe("qué troza se puede consumir", () => {
  it("una troza normal del patio, sí", () => {
    expect(motivoBloqueo(troza())).toBeNull();
    expect(estaDisponible(troza())).toBe(true);
  });

  it("la que ya se comió otra corrida, no", () => {
    expect(motivoBloqueo(troza({ consumidaEnId: "c9" }))).toBe("ya_consumida");
  });

  it("la que nunca llegó al patio, no (ADR-325)", () => {
    expect(motivoBloqueo(troza({ noRecepcionada: true }))).toBe("no_recepcionada");
  });

  it("el descarte del retrozado, no: ocupa volumen pero no es producto", () => {
    expect(motivoBloqueo(troza({ descarte: true }))).toBe("descarte");
  });

  it("la MADRE partida en pedazos, no: van los pedazos", () => {
    // Consumir la madre Y sus pedazos contaría la misma madera dos veces.
    expect(motivoBloqueo(troza({ retrozos: 2 }))).toBe("madre_retrozada");
    // El pedazo sí se puede.
    expect(motivoBloqueo(troza({ id: "p1", trozaOrigenId: "t1", volumenM3: 1.8 }))).toBeNull();
  });

  it("sin volumen registrado, no: no habría qué atribuir", () => {
    expect(motivoBloqueo(troza({ volumenM3: null }))).toBe("sin_volumen");
    expect(motivoBloqueo(troza({ volumenM3: 0 }))).toBe("sin_volumen");
  });
});

describe("filtros de la tabla", () => {
  const lista = [
    troza({ id: "a", codificacion: "52/A", codigoPlanta: "118", especieComun: "Tornillo" }),
    troza({ id: "b", codificacion: "13/C", codigoPlanta: "204", especieComun: "Copaiba", gtfNumber: "019-0000003" }),
    troza({ id: "c", codificacion: "77/B", codigoPlanta: "310", especieComun: "Tornillo", consumidaEnId: "c9" }),
  ];

  it("busca por la codificación del bosque y por la que marcó el patio", () => {
    expect(filtrarTrozas(lista, { texto: "52/A" }).map((t) => t.id)).toEqual(["a"]);
    // 204 es el código pintado en la testa: en planta se pregunta por ese.
    expect(filtrarTrozas(lista, { texto: "204" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("ignora tildes y mayúsculas", () => {
    const conTilde = [troza({ id: "x", especieComun: "Marupá" })];
    expect(filtrarTrozas(conTilde, { texto: "MARUPA" })).toHaveLength(1);
  });

  it("filtra por especie y por guía", () => {
    expect(filtrarTrozas(lista, { especie: "Tornillo" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filtrarTrozas(lista, { gtf: "019-0000003" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("«sólo disponibles» esconde las bloqueadas", () => {
    expect(filtrarTrozas(lista, { soloDisponibles: true }).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("totales de la selección", () => {
  it("suma piezas, m³ y pie tablar", () => {
    const t = totalesSeleccion([troza({ id: "a", volumenM3: 3 }), troza({ id: "b", volumenM3: 2 })]);
    expect(t.piezas).toBe(2);
    expect(t.volumenM3).toBe(5);
    // 1 m³ ≈ 423.78 pt, el mismo factor del cubicador.
    expect(t.pieTablar).toBe(Math.round(5 * 423.78));
    expect(t.guias).toBe(1);
    expect(t.especies).toBe(1);
  });

  it("cuenta guías y especies distintas", () => {
    const t = totalesSeleccion([
      troza({ id: "a", woodEntryId: "w1", especieComun: "Tornillo" }),
      troza({ id: "b", woodEntryId: "w2", especieComun: "Copaiba" }),
    ]);
    expect(t.guias).toBe(2);
    expect(t.especies).toBe(2);
  });
});

describe("de las piezas al consumo por guía", () => {
  it("agrupa y deriva el volumen — nadie tipea un número que no cuadre", () => {
    const g = agruparPorGuia([
      troza({ id: "a", woodEntryId: "w1", volumenM3: 3 }),
      troza({ id: "b", woodEntryId: "w1", volumenM3: 2.5 }),
      troza({ id: "c", woodEntryId: "w2", volumenM3: 1, gtfNumber: "019-0000003" }),
    ]);
    expect(g).toHaveLength(2);
    // Ordenado por volumen: la guía que más aporta va primero.
    expect(g[0].woodEntryId).toBe("w1");
    expect(g[0].piezas).toBe(2);
    expect(g[0].volumenM3).toBe(5.5);
    expect(g[0].trozaIds).toEqual(["a", "b"]);
    expect(g[1].volumenM3).toBe(1);
  });

  it("sin selección no hay consumo", () => {
    expect(agruparPorGuia([])).toEqual([]);
  });
});

describe("avisos de la selección", () => {
  it("avisa que mezclar especies rompe la comparación del rendimiento", () => {
    const avisos = avisosSeleccion([
      troza({ id: "a", especieComun: "Tornillo" }),
      troza({ id: "b", especieComun: "Copaiba" }),
    ]);
    expect(avisos.join(" ")).toMatch(/mezcla 2 especies/);
  });

  it("avisa cuando el consumo se reparte entre varias guías", () => {
    const avisos = avisosSeleccion([
      troza({ id: "a", woodEntryId: "w1" }),
      troza({ id: "b", woodEntryId: "w2" }),
    ]);
    expect(avisos.join(" ")).toMatch(/2 guías distintas/);
  });

  it("una corrida de una especie y una guía no genera ruido", () => {
    expect(avisosSeleccion([troza({ id: "a" }), troza({ id: "b" })])).toEqual([]);
  });
});
