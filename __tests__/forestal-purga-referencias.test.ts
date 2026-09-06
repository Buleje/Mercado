/**
 * Qué salva a una corrida de un vaciado parcial del Libro.
 *
 * El vaciado por alcance («Consumo», «Madera disponible») borra EN DURO. La
 * única defensa es la lista de referencias de `corridasSinTocar()`, y dos de
 * ellas no tienen red debajo:
 *
 *  · `ForestLoteAserrio.produccionEntryId` es un id SUELTO —sin `@relation` en
 *    el schema— así que no hay `onDelete: Restrict` que frene nada.
 *  · `WoodEntryTroza.consumidaEn` es `SetNull`: el borrado pasa limpio y deja
 *    la pieza «consumida por nadie», que cuadra en los conteos y miente en la
 *    trazabilidad.
 *
 * Las dos FALTABAN hasta 2026-09-05 (auditoría del commit eec478b5). Para esos
 * dos casos este test no es un complemento del constraint: es el constraint.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  entryFindMany: vi.fn(),
  despachoFindMany: vi.fn(),
  reprocesoFindMany: vi.fn(),
  loteMiembroFindMany: vi.fn(),
  loteAserrioFindMany: vi.fn(),
  trozaFindMany: vi.fn(),
  consumoCount: vi.fn(),
  entryCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestCtpEntry: { findMany: mocks.entryFindMany, count: mocks.entryCount },
    forestCtpDespachoOrigen: { findMany: mocks.despachoFindMany },
    forestCtpReproceso: { findMany: mocks.reprocesoFindMany },
    forestProdLoteMiembro: { findMany: mocks.loteMiembroFindMany },
    forestLoteAserrio: { findMany: mocks.loteAserrioFindMany },
    woodEntryTroza: { findMany: mocks.trozaFindMany, count: vi.fn() },
    forestCtpConsumo: { count: mocks.consumoCount },
  },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: {} }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));

const { ForestCtpPurgaDB } = await import("@/lib/db/forest-ctp-purga.db");

/** Tres corridas vivas con saldo declarado. */
const CORRIDAS = [
  { id: "c1", quantity: 10 },
  { id: "c2", quantity: 10 },
  { id: "c3", quantity: 10 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entryFindMany.mockResolvedValue(CORRIDAS);
  mocks.entryCount.mockResolvedValue(CORRIDAS.length);
  mocks.consumoCount.mockResolvedValue(0);
  // Por defecto nada referencia a nada; cada test enciende lo suyo.
  mocks.despachoFindMany.mockResolvedValue([]);
  mocks.reprocesoFindMany.mockResolvedValue([]);
  mocks.loteMiembroFindMany.mockResolvedValue([]);
  mocks.loteAserrioFindMany.mockResolvedValue([]);
  mocks.trozaFindMany.mockResolvedValue([]);
});

/** Cuántas corridas quedarían como candidatas a borrar, y cuántas se salvaron. */
async function contar(scope: "consumo" | "madera_disponible" = "consumo") {
  const r = await ForestCtpPurgaDB.contar("t1", scope);
  return { candidatas: r.produccion, saltadas: r.saltadas };
}

describe("sin nada encima, la corrida es candidata", () => {
  it("las tres se pueden borrar", async () => {
    expect(await contar()).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("🚨 un LOTE DE ASERRÍO salva a su corrida (no hay FK que lo haga)", () => {
  it("la corrida que un lote apunta deja de ser candidata", async () => {
    mocks.loteAserrioFindMany.mockResolvedValue([{ produccionEntryId: "c2" }]);
    expect(await contar()).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("un lote BORRADO (soft-delete) no salva nada — se consulta con deletedAt: null", async () => {
    // El mock devuelve vacío porque el `where` filtra los borrados; lo que se
    // fija acá es que la consulta lleve ese filtro.
    mocks.loteAserrioFindMany.mockResolvedValue([]);
    await contar();
    const where = mocks.loteAserrioFindMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.tenantId).toBe("t1");
  });

  it("un lote sin corrida asignada (produccionEntryId null) no rompe el conteo", async () => {
    mocks.loteAserrioFindMany.mockResolvedValue([{ produccionEntryId: null }]);
    expect(await contar()).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("🚨 las TROZAS consumidas salvan a su corrida (su relación es SetNull)", () => {
  it("la corrida donde se consumieron trozas deja de ser candidata", async () => {
    mocks.trozaFindMany.mockResolvedValue([{ consumidaEnId: "c3" }]);
    expect(await contar()).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("un consumidaEnId null no rompe el conteo", async () => {
    mocks.trozaFindMany.mockResolvedValue([{ consumidaEnId: null }]);
    expect(await contar()).toEqual({ candidatas: 3, saltadas: 0 });
  });
});

describe("las referencias que ya estaban siguen salvando", () => {
  it("despacho", async () => {
    mocks.despachoFindMany.mockResolvedValue([{ produccionEntryId: "c1" }]);
    expect(await contar()).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("lote comercial (ForestProdLoteMiembro — el que NO es el de aserrío)", async () => {
    mocks.loteMiembroFindMany.mockResolvedValue([{ produccionEntryId: "c1" }]);
    expect(await contar()).toEqual({ candidatas: 2, saltadas: 1 });
  });
});

describe("varias referencias a la vez", () => {
  it("no se cuenta dos veces la misma corrida salvada por dos motivos", async () => {
    mocks.loteAserrioFindMany.mockResolvedValue([{ produccionEntryId: "c1" }]);
    mocks.trozaFindMany.mockResolvedValue([{ consumidaEnId: "c1" }]);
    expect(await contar()).toEqual({ candidatas: 2, saltadas: 1 });
  });

  it("si todo está referenciado, no queda nada para borrar", async () => {
    mocks.loteAserrioFindMany.mockResolvedValue([
      { produccionEntryId: "c1" },
      { produccionEntryId: "c2" },
    ]);
    mocks.trozaFindMany.mockResolvedValue([{ consumidaEnId: "c3" }]);
    expect(await contar()).toEqual({ candidatas: 0, saltadas: 3 });
  });
});
