/**
 * ForestCorridaCompraDB.ligar — el doble envío es idempotente (revisión 08-10).
 * Escribe los consumos que la propuesta firmada usó; antes releía los actuales
 * después de comparar la firma, y el segundo envío sumaba las filas otra vez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  consumosFindMany: vi.fn(),
  setConsumos: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: {
      findFirst: vi.fn(async () => ({
        id: "c1",
        lineNo: 3,
        entryDate: new Date("2026-10-01T00:00:00Z"),
        speciesCommon: "Cumala",
        volumeInputM3: 4,
        status: "registrado",
        aperturaDeclaradaAt: null,
        duenoMadera: null,
        titularNombre: null,
        originCode: null,
        contratoId: null,
        contrato: null,
        unit: "m3",
        reprocesosEntrada: [],
      })),
    },
    forestCtpConsumo: { findMany: H.consumosFindMany, groupBy: vi.fn(async () => []) },
    woodEntry: {
      findMany: vi.fn(async () => [
        {
          id: "a",
          gtfNumber: "GTF-A",
          entryDate: new Date("2026-09-29T00:00:00Z"),
          fechaRecepcion: null,
          speciesCommonName: "Cumala",
          status: "validado",
          volumeM3: 10,
          costoTotal: 3000,
          moneda: "PEN",
          maderaDeTercero: false,
          duenoNombre: null,
          originCode: null,
          contratoId: null,
          contrato: null,
        },
      ]),
    },
    woodEntryTroza: { groupBy: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: vi.fn(async () => []) } }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({
  CONSUMO_VIGENTE: {},
  CtpInvariantError: class extends Error {},
  ForestCtpConsumoDB: { setConsumos: H.setConsumos, costoDeLinea: vi.fn(async () => ({})) },
}));

import { ForestCorridaCompraDB } from "@/lib/db/forest-corrida-compra.db";
import { firmaDePropuesta } from "@/lib/forestal/corrida-compra";

describe("ForestCorridaCompraDB.ligar", () => {
  beforeEach(() => {
    H.consumosFindMany.mockReset();
    H.setConsumos.mockReset();
  });

  it("dos envíos con la misma firma escriben el mismo conjunto (no suman las filas dos veces)", async () => {
    /* La primera lectura es la que firmó el operador (vacía); si alguien relee
       después, ya ve lo que escribió el envío gemelo. */
    H.consumosFindMany.mockResolvedValueOnce([]).mockResolvedValue([{ woodEntryId: "a", volumeM3: 4, congeladoAt: null }]);
    const firma = firmaDePropuesta("c1", 0, [{ woodEntryId: "a", m3: 4 }]);
    await ForestCorridaCompraDB.ligar("t1", "c1", firma, "qa");
    expect(H.consumosFindMany).toHaveBeenCalledTimes(1);
    expect(H.setConsumos).toHaveBeenCalledWith("t1", "c1", [{ woodEntryId: "a", volumeM3: 4 }], "qa");
  });
});
