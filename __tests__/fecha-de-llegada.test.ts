/**
 * __tests__/fecha-de-llegada.test.ts — ADR-434, la fecha real de llegada.
 *
 * Las fixtures salen de Blas (lectura del 25-09): el permiso
 * 10-HUA-PUE/PER-FMP-2026-007 tiene corridas de Cachimbo desde el 07/09, y sus
 * guías (fechadas del 31/08 al 07/09, asentadas el 08/09 a las 15:3x) quedaron
 * recibidas el 23/09 por «Recibir en bloque» con la fecha de hoy.
 */
import { describe, expect, it } from "vitest";

import {
  avisoDePlazo,
  avisosDeCorridas,
  choquesConLaSierra,
  corridasAntesDeLaLlegada,
  esDiaValido,
  llegadaSospechosa,
  mensajeDeChoque,
  plazoDesdeLaLlegada,
  problemaDeLlegada,
  propuestaDeLlegada,
  revisarLlegada,
  sigueALaGuia,
  yaRecibida,
  type ContextoDeLlegada,
  type PiezaAserrada,
} from "@/lib/forestal/fecha-de-llegada";

const HOY = "2026-09-25";

const corridasBlas = [
  { especie: "Cachimbo", dia: "2026-09-07" },
  { especie: "Cachimbo", dia: "2026-09-10" },
  { especie: "Cachimbo", dia: "2026-09-21" },
  { especie: "Copal", dia: "2026-09-07" },
  { especie: "Tacho", dia: "2026-09-07" },
];

const pieza = (over: Partial<PiezaAserrada> = {}): PiezaAserrada => ({
  id: "t1",
  codigo: "A-1",
  fechaPropia: null,
  fechaDeSuAsiento: "2026-09-23",
  corrida: { id: "c12", lineNo: 12, fecha: "2026-09-07" },
  ...over,
});

const ctx = (over: Partial<ContextoDeLlegada> = {}): ContextoDeLlegada => ({
  gtfNumber: "010-001-0000006",
  asientos: 4,
  guia: "2026-09-02",
  asiento: "2026-09-08",
  recepcion: "2026-09-23",
  recepcionPareja: true,
  filasSinRecibir: [],
  registradoEl: "2026-09-08T15:35:00.000Z",
  especies: ["Cachimbo", "Cumala", "Shimbillo", "Copal"],
  permiso: "10-HUA-PUE/PER-FMP-2026-007",
  corridas: corridasBlas,
  piezasAserradas: [],
  mesesDeAsientos: ["2026-09"],
  mesesCerrados: [],
  congelado: false,
  ...over,
});

describe("qué fecha se propone", () => {
  it("la de la guía, no la de hoy", () => {
    expect(propuestaDeLlegada({ guia: "2026-09-02T00:00:00.000Z", asiento: "2026-09-08" }, HOY)).toEqual({
      dia: "2026-09-02",
      fuente: "guia",
    });
  });
  it("una guía a medio recibir mantiene el día que ya declaró; al corregir, no", () => {
    const f = { guia: "2026-09-02", asiento: "2026-09-08", recepcion: "2026-09-04" };
    expect(propuestaDeLlegada(f, HOY)?.fuente).toBe("recepcion");
    expect(propuestaDeLlegada(f, HOY, false)).toEqual({ dia: "2026-09-02", fuente: "guia" });
  });
  it("sin fecha de guía, la del asiento; sin ninguna, nada", () => {
    expect(propuestaDeLlegada({ guia: null, asiento: "2026-09-08" }, HOY)?.fuente).toBe("asiento");
    expect(propuestaDeLlegada({ guia: null, asiento: null }, HOY)).toBeNull();
  });
  it("nunca propone el futuro: una guía mal tipeada propone hoy", () => {
    expect(propuestaDeLlegada({ guia: "2026-10-02", asiento: "2026-09-08" }, HOY)).toEqual({ dia: HOY, fuente: "hoy" });
  });
});

describe("qué fecha no se acepta", () => {
  it("vacía, con otro formato o que no existe", () => {
    expect(problemaDeLlegada("", "2026-09-02", HOY)).toContain("Falta la fecha");
    expect(problemaDeLlegada("02/09/2026", "2026-09-02", HOY)).toContain("Falta la fecha");
    expect(esDiaValido("2026-02-31")).toBe(false);
  });
  it("futura, con el hoy de Lima", () => {
    expect(problemaDeLlegada("2026-09-26", null, HOY)).toBe("No puede ser una fecha futura: hoy es 25/09.");
  });
  it("antes de que existiera su guía", () => {
    expect(problemaDeLlegada("2026-09-01", "2026-09-02", HOY)).toBe(
      "La madera no pudo llegar antes de su guía, que es del 02/09.",
    );
  });
  it("el mismo día de la guía y hoy sirven", () => {
    expect(problemaDeLlegada("2026-09-02", "2026-09-02", HOY)).toBeNull();
    expect(problemaDeLlegada(HOY, "2026-09-02", HOY)).toBeNull();
  });
});

describe("aviso: corridas del permiso anteriores a la llegada", () => {
  it("el caso de Blas: recibida el 23/09 con Cachimbo aserrado desde el 07/09", () => {
    expect(avisosDeCorridas("2026-09-23", ["Cachimbo"], corridasBlas)).toEqual([
      "Hay 3 corridas de Cachimbo de este permiso desde el 07/09: si la madera llegó el 23/09, esas corridas no pudieron salir de esta guía.",
    ]);
  });
  it("el mismo día pasa: se descarga a la mañana y se asierra a la tarde", () => {
    expect(avisosDeCorridas("2026-09-07", ["Cachimbo", "Copal"], corridasBlas)).toEqual([]);
  });
  it("sólo las especies de la guía, escritas como sea", () => {
    const r = corridasAntesDeLaLlegada("2026-09-08", ["  CACHIMBO "], corridasBlas);
    expect(r).toEqual([{ especie: "CACHIMBO", n: 1, desde: "2026-09-07" }]);
  });
  it("varias especies van en UNA línea", () => {
    const a = avisosDeCorridas("2026-09-23", ["Cachimbo", "Copal", "Cumala"], corridasBlas);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("Hay 4 corridas de este permiso anteriores a esa fecha (Cachimbo 3 desde el 07/09, Copal 1 desde el 07/09)");
  });
  it("la guía recibida después de sus corridas es sospechosa; la recibida el día de la guía, no", () => {
    expect(llegadaSospechosa(ctx())).toBe(true);
    expect(llegadaSospechosa(ctx({ recepcion: "2026-09-02" }))).toBe(false);
    expect(llegadaSospechosa(ctx({ recepcion: null }))).toBe(false);
  });
});

describe("aviso: el plazo de registro con esa llegada", () => {
  it("llegó el 02/09 y se asentó el 08/09: 4 días hábiles, fuera del plazo de 2", () => {
    expect(plazoDesdeLaLlegada("2026-09-02", "2026-09-08T15:35:00.000Z")).toEqual({ diasHabiles: 4, fuera: true });
    expect(avisoDePlazo("2026-09-02", "2026-09-08T15:35:00.000Z")).toBe(
      "Con esta fecha, el asiento queda fuera de plazo: se registró 4 días hábiles después de la llegada (el plazo es 2).",
    );
  });
  it("llegó el 07/09 y se asentó el 08/09: dentro, no se dice nada", () => {
    expect(avisoDePlazo("2026-09-07", "2026-09-08T15:34:00.000Z")).toBeNull();
  });
  it("asentada antes de llegar: 0 días, dentro", () => {
    expect(plazoDesdeLaLlegada("2026-09-23", "2026-09-08T15:35:00.000Z")).toEqual({ diasHabiles: 0, fuera: false });
  });
});

describe("guard: una corrida que ya aserró trozas de la guía (T3 al revés)", () => {
  it("la troza sin fecha propia o con la de su guía sigue a la guía; la de otro viaje, no", () => {
    expect(sigueALaGuia(pieza())).toBe(true);
    expect(sigueALaGuia(pieza({ fechaPropia: "2026-09-23T00:00:00.000Z" }))).toBe(true);
    expect(sigueALaGuia(pieza({ fechaPropia: "2026-09-05" }))).toBe(false);
  });
  it("atrasar la llegada después de la corrida choca; el mismo día o antes, no", () => {
    expect(choquesConLaSierra("2026-09-23", [pieza()])).toEqual([
      { corridaId: "c12", lineNo: 12, dia: "2026-09-07", trozas: [{ id: "t1", codigo: "A-1" }] },
    ]);
    expect(choquesConLaSierra("2026-09-07", [pieza()])).toEqual([]);
    expect(choquesConLaSierra("2026-09-02", [pieza()])).toEqual([]);
  });
  it("una troza que bajó en otro viaje no ata la guía", () => {
    expect(choquesConLaSierra("2026-09-23", [pieza({ fechaPropia: "2026-09-05" })])).toEqual([]);
  });
  it("el mensaje dice qué corrida, qué trozas y hasta qué día", () => {
    const choques = choquesConLaSierra("2026-09-20", [
      pieza(),
      pieza({ id: "t2", codigo: "A-2" }),
      pieza({ id: "t3", codigo: "B-1", corrida: { id: "c15", lineNo: 15, fecha: "2026-09-10" } }),
    ]);
    expect(mensajeDeChoque("001-0000202", "2026-09-20", choques)).toBe(
      "La corrida N° 12 del 07/09 ya aserró 2 trozas A-1, A-2 de la guía 001-0000202 (y 1 corrida más hasta el 10/09): " +
        "la madera no pudo llegar el 20/09. La llegada tiene que ser el 07/09 o antes, o primero saca esas trozas de la corrida.",
    );
  });
});

describe("revisarLlegada: la misma regla en la pantalla y en el servidor", () => {
  it("corregir las guías de Blas a la fecha de su guía: sin bloqueo, con el aviso de plazo", () => {
    const r = revisarLlegada("2026-09-02", ctx(), HOY, "corregir");
    expect(r.bloqueo).toBeNull();
    expect(r.avisos).toEqual([
      "Con esta fecha, el asiento queda fuera de plazo: se registró 4 días hábiles después de la llegada (el plazo es 2).",
    ]);
  });
  it("una fecha imposible frena antes que todo y no avisa nada", () => {
    expect(revisarLlegada("2026-09-01", ctx(), HOY, "corregir")).toEqual({
      bloqueo: { codigo: "VALIDACION", mensaje: "La madera no pudo llegar antes de su guía, que es del 02/09." },
      avisos: [],
    });
  });
  it("corregir una guía no recibida manda a recibirla", () => {
    expect(revisarLlegada("2026-09-02", ctx({ recepcion: null, recepcionPareja: false }), HOY, "corregir").bloqueo?.codigo).toBe(
      "ESTADO_NO_EDITABLE",
    );
  });
  it("a medio recibir no se corrige: primero se recibe la fila que falta", () => {
    const r = revisarLlegada("2026-09-02", ctx({ recepcionPareja: false, filasSinRecibir: ["Cumala", "Copal"] }), HOY, "corregir");
    expect(r.bloqueo).toEqual({
      codigo: "ESTADO_NO_EDITABLE",
      mensaje: "A esta guía le falta recibir las filas de Cumala, Copal: recíbelas primero en «Recibir en bloque».",
    });
    /* Al recibir, esa misma guía sí pasa: es justo lo que hay que hacer. */
    expect(revisarLlegada("2026-09-02", ctx({ recepcionPareja: false, filasSinRecibir: ["Cumala"] }), HOY, "recibir").bloqueo).toBeNull();
  });

  it("la misma fecha que ya tiene no es una corrección", () => {
    expect(revisarLlegada("2026-09-23", ctx(), HOY, "corregir").bloqueo?.mensaje).toBe("La guía ya figura recibida el 23/09.");
  });
  it("costo congelado frena al corregir, no al recibir", () => {
    expect(revisarLlegada("2026-09-02", ctx({ congelado: true }), HOY, "corregir").bloqueo?.codigo).toBe("CONGELADO");
    expect(revisarLlegada("2026-09-02", ctx({ congelado: true, recepcion: null }), HOY, "recibir").bloqueo).toBeNull();
  });
  it("mes cerrado: el del asiento siempre; el de la fecha nueva, al corregir", () => {
    const agosto = [{ periodKey: "2026-08", label: "agosto de 2026" }];
    const c = ctx({ guia: "2026-08-24", mesesCerrados: agosto });
    expect(revisarLlegada("2026-08-25", c, HOY, "corregir").bloqueo?.codigo).toBe("PERIODO_CERRADO");
    expect(revisarLlegada("2026-09-01", c, HOY, "corregir").bloqueo).toBeNull();
    expect(revisarLlegada("2026-08-25", ctx({ guia: "2026-08-20", mesesDeAsientos: ["2026-08"], mesesCerrados: agosto }), HOY, "recibir").bloqueo?.codigo).toBe(
      "PERIODO_CERRADO",
    );
  });
  it("T3 al revés: corregir a después de la corrida frena con su mensaje", () => {
    const r = revisarLlegada("2026-09-20", ctx({ piezasAserradas: [pieza()] }), HOY, "corregir");
    expect(r.bloqueo?.codigo).toBe("T3_ASERRADA_ANTES_DE_LLEGAR");
    expect(r.bloqueo?.mensaje).toContain("La corrida N° 12 del 07/09 ya aserró la troza A-1");
  });
  it("al recibir sólo cuentan las trozas sin fecha propia: las demás no se tocan", () => {
    const conFecha = pieza({ fechaPropia: "2026-09-23", fechaDeSuAsiento: null });
    expect(revisarLlegada("2026-09-20", ctx({ recepcion: null, piezasAserradas: [conFecha] }), HOY, "recibir").bloqueo).toBeNull();
    expect(
      revisarLlegada("2026-09-20", ctx({ recepcion: null, piezasAserradas: [pieza({ fechaDeSuAsiento: null })] }), HOY, "recibir")
        .bloqueo?.codigo,
    ).toBe("T3_ASERRADA_ANTES_DE_LLEGAR");
  });
});

describe("qué guía se puede corregir", () => {
  it("viva y con alguna recepción", () => {
    expect(yaRecibida({ status: "validado", lineas: [{ fechaRecepcion: "2026-09-23T00:00:00.000Z" }] })).toBe(true);
    expect(yaRecibida({ status: "pendiente", lineas: [{ fechaRecepcion: null }] })).toBe(false);
    expect(yaRecibida({ status: "rechazado", lineas: [{ fechaRecepcion: "2026-09-23" }] })).toBe(false);
    expect(yaRecibida({ status: "mixto", lineas: [{ status: "anulado", fechaRecepcion: "2026-09-23" }] })).toBe(false);
  });
});
