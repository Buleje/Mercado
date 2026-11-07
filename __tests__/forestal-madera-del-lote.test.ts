/**
 * La etiqueta de madera de un lote (Brandon, 2026-10-02): «cuáles tienen madera
 * aserrada y desde cuándo, y cuáles ya no (usada o despachada)».
 *
 * Lo que se prueba es que la etiqueta diga lo MISMO que Productos disponibles:
 * lo marcado como usado no está aunque tenga saldo, y una corrida con todos sus
 * paquetes en guías vivas tampoco.
 */
import { describe, expect, it } from "vitest";
import {
  enProductosDisponibles,
  m3YPtDe,
  maderaDelLote,
  type CorridaParaMadera,
} from "@/lib/forestal/madera-del-lote";

function corrida(over: Partial<CorridaParaMadera> = {}): CorridaParaMadera {
  return {
    id: "c1",
    fecha: "2026-08-01T00:00:00.000Z",
    unidad: "m3",
    usadoAt: null,
    producido: 10,
    despachado: 0,
    reprocesado: 0,
    disponible: 10,
    paquetes: 0,
    paquetesEnPila: 0,
    salidas: [],
    ...over,
  };
}

describe("enProductosDisponibles", () => {
  it("lo marcado como usado no está, aunque le quede saldo", () => {
    expect(enProductosDisponibles(corrida({ usadoAt: "2026-09-01T00:00:00.000Z" }))).toBe(false);
  });
  it("con todos sus paquetes en guías vivas no hay nada en la pila", () => {
    expect(enProductosDisponibles(corrida({ paquetes: 3, paquetesEnPila: 0 }))).toBe(false);
    expect(enProductosDisponibles(corrida({ paquetes: 3, paquetesEnPila: 1 }))).toBe(true);
  });
  it("sin saldo no está", () => {
    expect(enProductosDisponibles(corrida({ disponible: 0 }))).toBe(false);
  });
});

describe("m3YPtDe", () => {
  it("m³ pasa a pie tablar con PT_POR_M3 y pt a m³; otra unidad no inventa factor", () => {
    expect(m3YPtDe(1, "m3")).toEqual({ m3: 1, pt: 424 });
    expect(m3YPtDe(848, "pt")).toEqual({ m3: 2, pt: 848 });
    expect(m3YPtDe(5, "unidad")).toEqual({ m3: 0, pt: 0 });
  });
});

describe("maderaDelLote", () => {
  it("sin corridas con producto: sin_produccion", () => {
    expect(maderaDelLote([]).estado).toBe("sin_produccion");
  });

  it("con madera: dice cuánto queda y desde cuándo (la PRIMERA corrida)", () => {
    const m = maderaDelLote([
      corrida({ id: "a", fecha: "2026-08-05T00:00:00.000Z", disponible: 1.5 }),
      corrida({ id: "b", fecha: "2026-08-01T00:00:00.000Z", disponible: 848, unidad: "pt" }),
    ]);
    expect(m).toEqual({
      estado: "con_madera",
      m3Disponible: 3.5,
      ptDisponible: 1484,
      aserradaEl: "2026-08-01T00:00:00.000Z",
      salioEl: null,
      guias: [],
    });
  });

  it("parcial: queda algo y algo ya salió con guía", () => {
    const m = maderaDelLote([
      corrida({ id: "a", disponible: 4 }),
      corrida({
        id: "b",
        disponible: 0,
        despachado: 6,
        salidas: [{ fecha: "2026-09-10T00:00:00.000Z", gtf: " 1-19-0313629 " }],
      }),
    ]);
    expect(m.estado).toBe("parcial");
    expect(m.guias).toEqual(["1-19-0313629"]);
    expect(m.salioEl).toBe("2026-09-10T00:00:00.000Z");
  });

  it("usada: todo salió sin guía; salioEl es la marca", () => {
    const m = maderaDelLote([corrida({ usadoAt: "2026-09-20T00:00:00.000Z" })]);
    expect(m).toMatchObject({ estado: "usada", m3Disponible: 0, salioEl: "2026-09-20T00:00:00.000Z" });
  });

  it("despachada: todo salió con guía; guías sin repetir y en orden de fecha", () => {
    const m = maderaDelLote([
      corrida({
        disponible: 0,
        despachado: 10,
        salidas: [
          { fecha: "2026-09-12T00:00:00.000Z", gtf: "B" },
          { fecha: "2026-09-02T00:00:00.000Z", gtf: "A" },
          { fecha: "2026-09-15T00:00:00.000Z", gtf: "B" },
          { fecha: "2026-09-16T00:00:00.000Z", gtf: null },
        ],
      }),
    ]);
    expect(m.estado).toBe("despachada");
    expect(m.guias).toEqual(["A", "B"]);
    expect(m.salioEl).toBe("2026-09-16T00:00:00.000Z");
  });

  it("salió de las dos formas: manda la que se llevó más m³", () => {
    const despachoGrande = corrida({ id: "a", disponible: 0, despachado: 8 });
    const restoUsado = corrida({ id: "b", disponible: 2, usadoAt: "2026-09-20T00:00:00.000Z" });
    expect(maderaDelLote([despachoGrande, restoUsado]).estado).toBe("despachada");
    const usadoGrande = corrida({ id: "b", disponible: 9, usadoAt: "2026-09-20T00:00:00.000Z" });
    expect(maderaDelLote([despachoGrande, usadoGrande]).estado).toBe("usada");
  });

  it("sin saldo y sin salida (reprocesada): sin_saldo, nunca «despachada»", () => {
    const m = maderaDelLote([corrida({ disponible: 0, reprocesado: 10 })]);
    expect(m.estado).toBe("sin_saldo");
  });
});
