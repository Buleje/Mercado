/**
 * Qué salva a una corrida de un vaciado parcial del Libro.
 *
 * El vaciado por alcance («Consumos», «Madera aserrada») borra EN DURO. La
 * única defensa es la lista de referencias del plan (`planificarVaciado`), y
 * dos de ellas no tienen red debajo:
 *
 *  · `ForestLoteAserrio.produccionEntryId` es un id SUELTO —sin `@relation` en
 *    el schema— así que no hay `onDelete: Restrict` que frene nada.
 *  · `WoodEntryTroza.consumidaEn` es `SetNull`: el borrado pasa limpio y deja
 *    la pieza «consumida por nadie», que cuadra en los conteos y miente en la
 *    trazabilidad.
 *
 * Las dos FALTABAN hasta 2026-09-05 (auditoría del commit eec478b5). Para esos
 * dos casos este test no es un complemento del constraint: es el constraint.
 *
 * 2026-10-02: el plan pasó a ser una función pura sobre una foto del libro
 * (varios alcances a la vez + «Lotes»); los casos son los mismos de antes. Que
 * la foto sólo traiga lotes VIVOS lo fija `forestal-purga-vaciar.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { planificarVaciado, type SnapshotLibro } from "@/lib/forestal/ctp-purga-plan";

/** Tres corridas vivas con saldo declarado; nada referencia a nada. */
const base = (): SnapshotLibro => ({
  corridas: ["c1", "c2", "c3"].map((id, i) => ({
    id,
    section: "produccion",
    status: "registrado",
    borrada: false,
    quantity: 10,
    lineNo: i + 1,
    gtfNumber: null,
  })),
  trozas: [],
  despachoOrigenes: [],
  reprocesos: [],
  loteMiembros: [],
  consumos: [],
  lotesAserrio: [],
  lotesMixtos: [],
  lotesComerciales: [],
});

const lote = (id: string, produccionEntryId: string | null) => ({
  id,
  code: id,
  status: "consumido",
  produccionEntryId,
  loteMixtoId: null,
});
const troza = (id: string, consumidaEnId: string | null) => ({
  id,
  consumidaEnId,
  despachadaEnId: null,
  loteAserrioId: null,
  loteMixtoId: null,
  trozaOrigenId: null,
});

/** Cuántas corridas quedarían como candidatas a borrar, y cuántas se salvaron. */
function contar(snap: SnapshotLibro, scope: "consumo" | "madera_disponible" = "consumo") {
  const r = planificarVaciado(snap, [scope]);
  return { candidatas: r.conteo.produccion, saltadas: r.conteo.saltadas };
}

describe("sin nada encima, la corrida es candidata", () => {
  it("las tres se pueden borrar", () => {
    expect(contar(base())).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("🚨 un LOTE DE ASERRÍO salva a su corrida (no hay FK que lo haga)", () => {
  it("la corrida que un lote apunta deja de ser candidata", () => {
    expect(contar({ ...base(), lotesAserrio: [lote("la", "c2")] })).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("un lote sin corrida asignada (produccionEntryId null) no rompe el conteo", () => {
    expect(contar({ ...base(), lotesAserrio: [lote("la", null)] })).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("🚨 las TROZAS consumidas salvan a su corrida (su relación es SetNull)", () => {
  it("la corrida donde se consumieron trozas deja de ser candidata", () => {
    expect(contar({ ...base(), trozas: [troza("z", "c3")] })).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("un consumidaEnId null no rompe el conteo", () => {
    expect(contar({ ...base(), trozas: [troza("z", null)] })).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("las referencias que ya estaban siguen salvando", () => {
  it("despacho", () => {
    expect(contar({ ...base(), despachoOrigenes: [{ despachoEntryId: "d", produccionEntryId: "c1" }] })).toEqual({
      candidatas: 2,
      saltadas: 1,
    });
  });

  it("reproceso, como origen y como destino", () => {
    expect(contar({ ...base(), reprocesos: [{ origenEntryId: "c1", destinoEntryId: "c2" }] })).toEqual({
      candidatas: 1,
      saltadas: 2,
    });
  });

  it("lote comercial (ForestProdLoteMiembro — el que NO es el de aserrío)", () => {
    expect(contar({ ...base(), loteMiembros: [{ loteId: "l", produccionEntryId: "c1" }] })).toEqual({
      candidatas: 2,
      saltadas: 1,
    });
  });
});

describe("varias referencias a la vez", () => {
  it("no se cuenta dos veces la misma corrida salvada por dos motivos", () => {
    expect(contar({ ...base(), lotesAserrio: [lote("la", "c1")], trozas: [troza("z", "c1")] })).toEqual({
      candidatas: 2,
      saltadas: 1,
    });
  });

  it("si todo está referenciado, no queda nada para borrar", () => {
    expect(
      contar({ ...base(), lotesAserrio: [lote("a", "c1"), lote("b", "c2")], trozas: [troza("z", "c3")] }),
    ).toEqual({ candidatas: 0, saltadas: 3 });
  });
});
