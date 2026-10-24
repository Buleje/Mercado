/**
 * Los cierres de período se leen ANTES de abrir la transacción (ADR-441,
 * auditoría de seguridad): `setConsumos` y `vincularCorrida`.
 *
 * Antes, `ForestCtpCierreDB.closedPeriodOf` corría DENTRO de la transacción:
 * es un KV que se lee con el cliente GLOBAL, así que pedía una segunda conexión
 * del pool (5) con la de la tx tomada. Ahora el llamador lee `list()` afuera y
 * la regla se evalúa con la función pura `closedPeriodOf(cierres, fecha)`.
 *
 * Se prueba con un `prisma` falso que marca cuándo se está dentro de la tx:
 *  · `list()` se llama una vez y AFUERA; el `closedPeriodOf` del cliente global
 *    no se llama nunca (tira si lo hacen).
 *  · la regla no cambió: mes cerrado → PERIODO_CERRADO; mes abierto → sigue
 *    de largo (y cae en el paso siguiente, que el falso deja vacío a propósito).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monthRange, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";

const H = vi.hoisted(() => {
  const estado = {
    enTx: false,
    listFuera: 0,
    listDentro: 0,
    cierres: [] as unknown[],
    /** La fila que devuelve el lock de la corrida; `null` = no existe. */
    corrida: null as Record<string, unknown> | null,
  };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("?").includes('FROM "ForestCtpEntry"') && estado.corrida ? [estado.corrida] : [],
    forestCtpEntry: { findFirst: async () => (estado.corrida ? { entryDate: estado.corrida.entryDate } : null) },
    forestCtpConsumo: { count: async () => 0 },
    forestLoteAserrio: { count: async () => 0, findMany: async () => [] },
    woodEntryTroza: { count: async () => 0 },
  };
  return { estado, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      H.estado.enTx = true;
      try {
        return await fn(H.tx);
      } finally {
        H.estado.enTx = false;
      }
    },
  },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: {
    list: async () => {
      if (H.estado.enTx) H.estado.listDentro++;
      else H.estado.listFuera++;
      return H.estado.cierres;
    },
    closedPeriodOf: async () => {
      throw new Error("closedPeriodOf del cliente global: no debe llamarse (y menos dentro de la tx)");
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", async (real) => ({
  ...((await real()) as Record<string, unknown>),
  auditCtp: () => {},
  auditCtpEsperando: async () => {},
}));

import { CtpInvariantError, ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { ForestVincularCorridaDB } from "@/lib/db/forest-vincular-corrida.db";

/** Enero de 2099 cerrado. */
function eneroCerrado(): CtpCierrePeriodo {
  const { from, to, periodKey, label } = monthRange(2099, 0);
  return {
    periodKey,
    from: from.toISOString(),
    to: to.toISOString(),
    label,
    closedAt: new Date().toISOString(),
    closedBy: "qa",
    saldoCierre: { materiaPrima: [], productos: [] },
    totales: {
      corridas: 0,
      despachos: 0,
      ingresosCount: 0,
      volumenIngresado: 0,
      corridasCongeladas: 0,
      corridasSinCostear: 0,
      especiesEnNegativo: 0,
    },
  } as CtpCierrePeriodo;
}

const corridaDel = (dia: string) => ({
  id: "corrida-1",
  lineNo: 41,
  section: "produccion",
  status: "registrado",
  quantity: null,
  volumeInputM3: null,
  speciesCommon: "Tornillo",
  unit: "m3",
  entryDate: new Date(`${dia}T12:00:00.000Z`),
  aperturaDeclaradaAt: null,
});

const rechazo = async (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("debía rechazarse");
    },
    (e: unknown) => e,
  );

beforeEach(() => {
  Object.assign(H.estado, { enTx: false, listFuera: 0, listDentro: 0, cierres: [], corrida: null });
});

describe("setConsumos — el cierre se lee fuera de la transacción", () => {
  it("mes cerrado → PERIODO_CERRADO; `list()` una vez y afuera", async () => {
    H.estado.cierres = [eneroCerrado()];
    H.estado.corrida = corridaDel("2099-01-15");
    const e = await rechazo(ForestCtpConsumoDB.setConsumos("t1", "corrida-1", [{ woodEntryId: "w1", volumeM3: 1 }], "qa"));
    expect(e).toBeInstanceOf(CtpInvariantError);
    expect(e).toMatchObject({ code: "PERIODO_CERRADO", detail: { periodKey: "2099-01" } });
    expect(H.estado).toMatchObject({ listFuera: 1, listDentro: 0 });
  });

  it("mes abierto → pasa el cierre y sigue al lock de la línea", async () => {
    H.estado.cierres = [eneroCerrado()];
    H.estado.corrida = corridaDel("2099-02-15");
    /* El falso no devuelve la línea en el lock: que tire ESO prueba que el cierre no frenó. */
    H.tx.$queryRaw = async () => [];
    try {
      const e = await rechazo(ForestCtpConsumoDB.setConsumos("t1", "corrida-1", [{ woodEntryId: "w1", volumeM3: 1 }], "qa"));
      expect((e as Error).message).toBe("Línea CTP no encontrada");
    } finally {
      H.tx.$queryRaw = async (strings: TemplateStringsArray) =>
        strings.join("?").includes('FROM "ForestCtpEntry"') && H.estado.corrida ? [H.estado.corrida] : [];
    }
    expect(H.estado).toMatchObject({ listFuera: 1, listDentro: 0 });
  });
});

describe("vincularCorrida — el cierre se lee fuera de la transacción", () => {
  const pedido = (fecha?: Date) => ({ corridaId: "corrida-1", partes: [{ loteId: "L1", trozaIds: ["t1"] }], fecha });

  it("corrida de un mes cerrado → PERIODO_CERRADO", async () => {
    H.estado.cierres = [eneroCerrado()];
    H.estado.corrida = corridaDel("2099-01-20");
    const e = await rechazo(ForestVincularCorridaDB.vincularCorrida("t1", pedido(), "qa"));
    expect(e).toMatchObject({ code: "PERIODO_CERRADO", detail: { periodKey: "2099-01" } });
    expect(H.estado).toMatchObject({ listFuera: 1, listDentro: 0 });
  });

  it("corrida abierta con día de consumo en el mes cerrado → PERIODO_CERRADO del día", async () => {
    H.estado.cierres = [eneroCerrado()];
    H.estado.corrida = corridaDel("2099-02-10");
    const e = await rechazo(ForestVincularCorridaDB.vincularCorrida("t1", pedido(new Date("2099-01-28T12:00:00.000Z")), "qa"));
    expect(e).toMatchObject({ code: "PERIODO_CERRADO" });
    expect((e as Error).message).toMatch(/día de consumo cae en/);
    expect(H.estado).toMatchObject({ listFuera: 1, listDentro: 0 });
  });

  it("todo abierto → pasa el cierre y sigue a los lotes", async () => {
    H.estado.cierres = [eneroCerrado()];
    H.estado.corrida = corridaDel("2099-02-10");
    /* El falso no tiene lotes: que tire LOTE_NO_ENCONTRADO prueba que el cierre no frenó. */
    const e = await rechazo(ForestVincularCorridaDB.vincularCorrida("t1", pedido(), "qa"));
    expect(e).toMatchObject({ code: "LOTE_NO_ENCONTRADO" });
    expect(H.estado).toMatchObject({ listFuera: 1, listDentro: 0 });
  });
});
