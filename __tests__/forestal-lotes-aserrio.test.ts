import { describe, expect, it } from "vitest";
import {
  alertasDeLote,
  diasDeEspera,
  filtrarLotes,
  loteAserrioPorCorrida,
  loteVencido,
  margenLote,
  piezasLibres,
  rendimientoLote,
  resumenLotes,
  salidaDelLote,
  volumenLibre,
  type CorridaDelLote,
  type LoteAserrio,
  type TrozaDelLote,
} from "@/lib/forestal/lotes-aserrio";

/**
 * Lo que la pestaña de Lotes de aserrío afirma en pantalla (ADR-334).
 *
 * Cada número que muestra la vista sale de acá, así que acá se prueba: el
 * volumen que "va a entrar a la sierra" (no el que se apartó), el rendimiento
 * —que sólo existe si la corrida declaró en m³— y las alertas, que son las que
 * hacen que un lote olvidado no se quede reteniendo madera para siempre.
 */

const HOY = new Date("2026-08-06T12:00:00.000Z");

function troza(id: string, m3: number, extra: Partial<TrozaDelLote> = {}): TrozaDelLote {
  return {
    id,
    codificacion: `COD-${id}`,
    codigoPlanta: `10${id}`,
    volumenM3: m3,
    consumidaEnId: null,
    ...extra,
  };
}

function corrida(extra: Partial<CorridaDelLote> = {}): CorridaDelLote {
  return {
    id: "corrida-1",
    lineNo: 12,
    entryDate: "2026-08-04T00:00:00.000Z",
    productType: "Madera aserrada",
    quantity: 3,
    unit: "m3",
    status: "registrado",
    viva: true,
    ...extra,
  };
}

function lote(extra: Partial<LoteAserrio> = {}): LoteAserrio {
  const trozas = extra.trozas ?? [troza("a", 2), troza("b", 3)];
  return {
    id: "lote-1",
    code: "LA-2026-001",
    speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis",
    status: "abierto",
    notes: null,
    fechaApertura: "2026-08-05T00:00:00.000Z",
    fechaConsumo: null,
    produccionEntryId: null,
    produccion: null,
    piezas: trozas.length,
    volumenM3: trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0),
    ...extra,
    trozas,
  };
}

describe("piezas libres del lote", () => {
  it("descuenta las que ya se comió otra corrida", () => {
    const l = lote({ trozas: [troza("a", 2), troza("b", 3, { consumidaEnId: "otra-corrida" })] });
    expect(piezasLibres(l).map((t) => t.id)).toEqual(["a"]);
    expect(volumenLibre(l)).toBe(2);
  });

  it("sin consumo por fuera, lo libre es todo el lote", () => {
    expect(volumenLibre(lote())).toBe(5);
  });
});

describe("rendimiento del lote", () => {
  it("es lo producido sobre lo que entró, en porcentaje con un decimal", () => {
    const l = lote({ status: "consumido", produccion: corrida({ quantity: 3 }) }); // 3 de 5
    expect(rendimientoLote(l)).toBe(60);
  });

  it("no inventa un porcentaje cuando la corrida declaró en otra unidad", () => {
    const l = lote({ status: "consumido", produccion: corrida({ unit: "pt", quantity: 1200 }) });
    expect(rendimientoLote(l)).toBeNull();
  });

  it("una corrida anulada no rinde: el lote apunta a algo que ya no existe", () => {
    const l = lote({ status: "consumido", produccion: corrida({ viva: false }) });
    expect(rendimientoLote(l)).toBeNull();
  });
});

describe("margen declarable del lote (ADR-365)", () => {
  it("es el mismo número que ofrece 'Agregar producción a esta corrida' en Producción", () => {
    // 10 m³ consumidos, tope 56% = 5.6, ya declarado 4 → quedan 1.6.
    const l = lote({
      status: "consumido",
      produccion: corrida({ quantity: 4, volumeInputM3: 10 }),
    });
    expect(margenLote(l)?.margenM3).toBeCloseTo(1.6, 4);
  });

  it("null cuando ya se llegó al tope: no hay nada más que declarar", () => {
    const l = lote({ status: "consumido", produccion: corrida({ quantity: 5.6, volumeInputM3: 10 }) });
    expect(margenLote(l)).toBeNull();
  });

  it("null en otra unidad: dividir pt por m³ no es un margen", () => {
    const l = lote({ status: "consumido", produccion: corrida({ unit: "pt", quantity: 1200, volumeInputM3: 10 }) });
    expect(margenLote(l)).toBeNull();
  });

  it("null si la corrida se anuló o el lote no tiene producción", () => {
    expect(margenLote(lote({ status: "consumido", produccion: corrida({ viva: false, volumeInputM3: 10 }) }))).toBeNull();
    expect(margenLote(lote())).toBeNull();
  });
});

describe("resumen del tablero", () => {
  const abierto = lote({ id: "l1", code: "LA-2026-001" });
  const abiertoConFuga = lote({
    id: "l2",
    code: "LA-2026-002",
    trozas: [troza("c", 4), troza("d", 1, { consumidaEnId: "x" })],
  });
  const aserradoAlto = lote({
    id: "l3",
    code: "LA-2026-003",
    status: "consumido",
    trozas: [troza("e", 40)],
    produccion: corrida({ quantity: 24, volumeInputM3: 40 }), // 60%
  });
  const aserradoBajo = lote({
    id: "l4",
    code: "LA-2026-004",
    status: "consumido",
    trozas: [troza("f", 1)],
    produccion: corrida({ quantity: 0.2, volumeInputM3: 1 }), // 20%
  });
  const aserradoEnPt = lote({
    id: "l5",
    code: "LA-2026-005",
    status: "consumido",
    trozas: [troza("g", 2)],
    produccion: corrida({ unit: "pt", quantity: 800 }),
  });

  it("lo apartado cuenta sólo lo que de verdad va a entrar a la sierra", () => {
    const r = resumenLotes([abierto, abiertoConFuga, aserradoAlto]);
    expect(r.abiertos).toBe(2);
    expect(r.piezasApartadas).toBe(3); // 2 del primero + 1 libre del segundo
    expect(r.volumenApartado).toBe(9); // 5 + 4
  });

  it("pondera el rendimiento por volumen y no promedia porcentajes", () => {
    const r = resumenLotes([aserradoAlto, aserradoBajo]);
    // Ponderado: 24.2 / 41 = 59.0 %. El promedio simple daría 40 %.
    expect(r.rendimientoPct).toBe(59);
    expect(r.consumidos).toBe(2);
    expect(r.volumenAserrado).toBe(41);
  });

  it("declara cuántos lotes quedaron fuera del rendimiento por unidad", () => {
    const r = resumenLotes([aserradoAlto, aserradoEnPt]);
    expect(r.sinRendimiento).toBe(1);
    expect(r.rendimientoPct).toBe(60);
  });

  it("sin corridas comparables el rendimiento es nulo, no cero", () => {
    expect(resumenLotes([abierto, aserradoEnPt]).rendimientoPct).toBeNull();
  });

  it("suma el margen declarable SOLO de los que todavía tienen espacio bajo el tope", () => {
    // aserradoAlto: 40 m³ → tope 22.4, declaró 24 → sobre el tope, no aporta.
    // aserradoBajo: 1 m³ → tope 0.56, declaró 0.2 → quedan 0.36.
    const r = resumenLotes([aserradoAlto, aserradoBajo]);
    expect(r.margenTotalM3).toBeCloseTo(0.36, 4);
  });
});

describe("lote vencido (ADR-342)", () => {
  const hoy = new Date("2026-08-31T12:00:00.000Z");

  it("vencido: abierto, con fecha de fin ya pasada", () => {
    expect(loteVencido(lote({ status: "abierto", finProceso: "2026-08-20T00:00:00.000Z" }), hoy)).toBe(true);
  });

  it("no vencido: la fecha de fin todavía no llegó", () => {
    expect(loteVencido(lote({ status: "abierto", finProceso: "2026-09-15T00:00:00.000Z" }), hoy)).toBe(false);
  });

  it("no vencido: sin fecha de fin declarada", () => {
    expect(loteVencido(lote({ status: "abierto", finProceso: null }), hoy)).toBe(false);
  });

  it("un lote consumido o cerrado no está 'vencido' aunque su fecha haya pasado: ya terminó su proceso", () => {
    expect(loteVencido(lote({ status: "consumido", finProceso: "2026-08-20T00:00:00.000Z" }), hoy)).toBe(false);
    expect(loteVencido(lote({ status: "cerrado", finProceso: "2026-08-20T00:00:00.000Z" }), hoy)).toBe(false);
  });
});

describe("filtro de lotes", () => {
  const tornillo = lote({ id: "l1", code: "LA-2026-001", notes: "Para el pedido de Satipo" });
  const capirona = lote({
    id: "l2",
    code: "LA-2026-002",
    speciesCommon: "Capirona",
    status: "consumido",
    trozas: [troza("z9", 1, { codigoPlanta: "3037752" })],
  });
  const todos = [tornillo, capirona];

  it("busca sin tildes ni mayúsculas", () => {
    expect(filtrarLotes(todos, { texto: "CAPIRONA" }).map((l) => l.id)).toEqual(["l2"]);
  });

  it("encuentra el lote por el código de una de sus piezas", () => {
    expect(filtrarLotes(todos, { texto: "3037752" }).map((l) => l.id)).toEqual(["l2"]);
  });

  it("busca en la nota del lote", () => {
    expect(filtrarLotes(todos, { texto: "satipo" }).map((l) => l.id)).toEqual(["l1"]);
  });

  it("estado vacío no filtra nada", () => {
    expect(filtrarLotes(todos, { estado: "" })).toHaveLength(2);
    expect(filtrarLotes(todos, { estado: "abierto" }).map((l) => l.id)).toEqual(["l1"]);
  });

  it("la especie se compara exacta, no por contenido", () => {
    expect(filtrarLotes(todos, { especie: "Tornillo" }).map((l) => l.id)).toEqual(["l1"]);
    expect(filtrarLotes(todos, { especie: "Torni" })).toHaveLength(0);
  });
});

describe("la salida del producto del lote", () => {
  it("suma despachado y reprocesado: las dos formas de que el producto deje de estar", () => {
    const l = lote({
      status: "consumido",
      produccion: corrida({ quantity: 6, despachadoQty: 2.5, reprocesadoQty: 1 }),
    });
    expect(salidaDelLote(l)).toEqual({ producido: 6, salido: 3.5, enPatio: 2.5, unidad: "m3" });
  });

  it("sin despachos, todo el producido sigue en patio", () => {
    expect(salidaDelLote(lote({ status: "consumido", produccion: corrida({ quantity: 6 }) }))?.enPatio).toBe(6);
  });

  it("nunca devuelve un patio negativo aunque los números no cuadren", () => {
    const l = lote({ status: "consumido", produccion: corrida({ quantity: 1, despachadoQty: 5 }) });
    expect(salidaDelLote(l)?.enPatio).toBe(0);
  });

  it("sin corrida viva no hay salida que declarar (null, no cero)", () => {
    expect(salidaDelLote(lote())).toBeNull();
    expect(salidaDelLote(lote({ produccion: corrida({ viva: false }) }))).toBeNull();
    expect(salidaDelLote(lote({ produccion: corrida({ quantity: 0 }) }))).toBeNull();
  });
});

describe("casillero (10) · qué lote se comió cada corrida", () => {
  it("mapea la corrida a su lote", () => {
    const l = lote({ status: "consumido", produccionEntryId: "corrida-1", produccion: corrida() });
    expect(loteAserrioPorCorrida([l]).get("corrida-1")).toBe("LA-2026-001");
  });

  it("un lote abierto todavía no declara nada", () => {
    expect(loteAserrioPorCorrida([lote()]).size).toBe(0);
  });

  it("una corrida anulada no declara su lote: esa madera volvió al patio", () => {
    const l = lote({ status: "consumido", produccionEntryId: "corrida-1", produccion: corrida({ viva: false }) });
    expect(loteAserrioPorCorrida([l]).size).toBe(0);
  });

  it("dos lotes aserrados juntos se declaran los dos", () => {
    const a = lote({ id: "l1", code: "LA-2026-001", status: "consumido", produccionEntryId: "c9", produccion: corrida() });
    const b = lote({ id: "l2", code: "LA-2026-002", status: "consumido", produccionEntryId: "c9", produccion: corrida() });
    expect(loteAserrioPorCorrida([a, b]).get("c9")).toBe("LA-2026-001, LA-2026-002");
  });
});

describe("alertas del lote", () => {
  it("avisa cuando lleva más de una semana esperando la sierra", () => {
    const viejo = lote({ fechaApertura: "2026-07-20T00:00:00.000Z" });
    const textos = alertasDeLote(viejo, HOY).map((a) => a.texto);
    expect(textos.some((t) => t.includes("Esperando la sierra"))).toBe(true);
    expect(diasDeEspera(viejo, HOY)).toBe(17);
  });

  it("un lote recién armado no molesta", () => {
    expect(alertasDeLote(lote(), HOY)).toHaveLength(0);
  });

  it("delata la madera que se fue por fuera del lote", () => {
    const l = lote({ trozas: [troza("a", 2), troza("b", 3, { consumidaEnId: "otra" })] });
    expect(alertasDeLote(l, HOY).some((a) => a.tono === "warning" && a.texto.includes("otra corrida"))).toBe(true);
  });

  it("un lote vacío se marca como tal", () => {
    const l = lote({ trozas: [], piezas: 0, volumenM3: 0 });
    expect(alertasDeLote(l, HOY).some((a) => a.texto.includes("vacío"))).toBe(true);
  });

  it("un lote consumido por una corrida anulada queda señalado", () => {
    const l = lote({ status: "consumido", produccion: corrida({ viva: false }) });
    expect(alertasDeLote(l, HOY).some((a) => a.texto.includes("anuló"))).toBe(true);
  });
});
