/**
 * El cruce lote ↔ producto: qué queda de cada lote y qué ya se fue.
 *
 * Lo que se prueba acá son las tres decisiones que cambian lo que ve el patio:
 * que una corrida marcada «usada» no cuente como disponible, que a una guía
 * sólo entre lo disponible, y que las corridas sin lote no inventen un lote.
 */

import { describe, expect, it } from "vitest";
import {
  agruparPorLote,
  destinoDe,
  totalDespachable,
  uidsDespachables,
  type CorridaConSaldo,
} from "@/lib/forestal/productos-de-lote";

function corrida(over: Partial<CorridaConSaldo> = {}): CorridaConSaldo {
  return {
    id: "c1",
    lineNo: 19,
    fecha: "2026-08-01",
    especie: "Tornillo",
    especieCientifica: null,
    producto: "MADERA ASERRADA (COMERCIAL)",
    presentacion: null,
    unidad: "m3",
    lote: "13-2026",
    cantidad: null,
    volumenConsumidoM3: null,
    producido: 10,
    despachado: 0,
    reprocesado: 0,
    disponible: 10,
    paquetes: [],
    observations: null,
    titularOrigen: [],
    gtfOrigen: [],
    usadoAt: null,
    usadoMotivo: null,
    ...over,
  };
}

const paquete = (id: string) => ({
  id,
  codigo: id.toUpperCase(),
  producto: null,
  presentacion: null,
  cantidad: 4,
  volumenM3: 2.5,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  observations: null,
});

describe("destinoDe", () => {
  it("lo marcado como usado NO está disponible, aunque le quede saldo", () => {
    /* Es la diferencia entre «me queda para vender» y «ya lo gasté acá»: en el
       tenant real las cinco corridas tienen saldo Y marca de uso. */
    const c = corrida({ disponible: 10, usadoAt: "2026-09-08T15:40:17.802Z" });
    expect(destinoDe(c)).toBe("usado");
  });

  it("con saldo y sin marca, está en patio", () => {
    expect(destinoDe(corrida({ disponible: 10 }))).toBe("disponible");
  });

  it("sin saldo y con salida, está despachado", () => {
    expect(destinoDe(corrida({ disponible: 0, despachado: 10 }))).toBe("despachado");
  });

  it("sin saldo y sin salida, no queda nada que decir", () => {
    expect(destinoDe(corrida({ disponible: 0 }))).toBe("agotado");
  });

  it("un saldo de milésimas no cuenta como madera en patio", () => {
    /* La tolerancia sale de cómo se mide: 0.00005 m³ son 50 mililitros de
       madera, no un producto que alguien pueda despachar. */
    expect(destinoDe(corrida({ disponible: 0.00005, despachado: 10 }))).toBe("despachado");
  });
});

describe("agruparPorLote", () => {
  it("suma por lote y separa lo usado de lo disponible", () => {
    const mapa = agruparPorLote([
      corrida({ id: "a", disponible: 10, producido: 10 }),
      corrida({ id: "b", disponible: 5, producido: 5, usadoAt: "2026-09-08T00:00:00Z" }),
      corrida({ id: "c", lote: "15-2026", disponible: 0, producido: 7, despachado: 7 }),
    ]);

    const l13 = mapa.get("13-2026");
    expect(l13?.producido).toBe(15);
    expect(l13?.disponible).toBe(10);
    expect(l13?.usado).toBe(5);

    const l15 = mapa.get("15-2026");
    expect(l15?.disponible).toBe(0);
    expect(l15?.despachado).toBe(7);
  });

  it("una corrida sin lote no inventa un lote", () => {
    /* La producción declarada sin lote tiene su propia pantalla: meterla en un
       balde «sin lote» la haría parecer parte de algo que no existe. */
    const mapa = agruparPorLote([corrida({ lote: null }), corrida({ id: "x", lote: "   " })]);
    expect(mapa.size).toBe(0);
  });
});

describe("uidsDespachables", () => {
  it("a la guía entra sólo lo disponible, paquete por paquete", () => {
    const mapa = agruparPorLote([
      corrida({ id: "a", paquetes: [paquete("p1"), paquete("p2")] }),
      corrida({ id: "b", disponible: 3, usadoAt: "2026-09-08T00:00:00Z", paquetes: [paquete("p9")] }),
      corrida({ id: "c", disponible: 0, despachado: 4, paquetes: [paquete("p8")] }),
    ]);
    const uids = uidsDespachables([...mapa.values()]);

    /* El formato es el que espera `presetUids` de la guía: `corridaId:paqueteId`. */
    expect(uids).toEqual(["a:p1", "a:p2"]);
    expect(uids.some((u) => u.startsWith("b:"))).toBe(false);
    expect(uids.some((u) => u.startsWith("c:"))).toBe(false);
  });

  it("una corrida sin paquetes entra como corrida entera", () => {
    const mapa = agruparPorLote([corrida({ id: "solo", paquetes: [] })]);
    expect(uidsDespachables([...mapa.values()])).toEqual(["solo:corrida"]);
  });
});

describe("totalDespachable", () => {
  it("cuenta lo que de verdad puede salir, no lo producido", () => {
    const mapa = agruparPorLote([
      corrida({ id: "a", disponible: 10, paquetes: [paquete("p1")] }),
      corrida({ id: "b", disponible: 5, usadoAt: "2026-09-08T00:00:00Z" }),
    ]);
    expect(totalDespachable([...mapa.values()])).toEqual({ corridas: 1, paquetes: 1, m3: 10 });
  });
});
