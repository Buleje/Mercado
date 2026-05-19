/**
 * B-P0-2 · cobrarPorCliente — race condition fix.
 *
 * Audit 2026-05-17: antes hacía `data: { saldo: newSaldo }` calculando JS-side
 * desde un saldo leído fuera del lock. Bajo concurrencia, 2 tx leían saldo=100
 * y ambas escribían 80 (perdiendo S/20). Comment "Y2 FIX 2026-05-07" mentía:
 * la implementación NO usaba `{ decrement }`.
 *
 * Este test verifica que el método use DECREMENT atómico DB-side via la
 * inspección del shape pasado a `tx.fiado.update`.
 */

import { describe, it, expect, vi } from "vitest";

const txMock = {
  fiado: {
    findMany: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn(),
  },
  fiadoCuota: {
    create: vi.fn().mockResolvedValue({ id: "cuota-1" }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: { findMany: vi.fn() },
    $transaction: (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/decimal-utils", () => ({
  toNumOrZero: (v: unknown) => (v == null ? 0 : Number(v)),
}));

describe("B-P0-2 · cobrarPorCliente usa updateMany TOCTOU guard (anti-overpayment)", () => {
  it("usa updateMany con where { saldo: { gte: payment } } — TOCTOU guard", async () => {
    vi.clearAllMocks();

    txMock.fiado.findMany.mockResolvedValue([
      { id: "f1", saldo: 100, status: "ACTIVO" },
    ]);
    txMock.fiado.updateMany.mockResolvedValue({ count: 1 }); // aplicó
    txMock.fiado.findFirst.mockResolvedValue({ saldo: 60 }); // saldo post-decrement

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.cobrarPorCliente("tenant-1", "987654321", 40);

    expect(txMock.fiado.updateMany).toHaveBeenCalled();
    const call = txMock.fiado.updateMany.mock.calls[0][0];

    // Guard crítico: where DEBE incluir saldo: { gte: payment }
    expect(call.where).toMatchObject({
      id: "f1",
      tenantId: "tenant-1",
      status: "ACTIVO",
      saldo: { gte: 40 },
    });
    expect(call.data.saldo).toEqual({ decrement: 40 });
  });

  it("si updateMany retorna count=0 (TOCTOU race perdido), NO crea cuota", async () => {
    vi.clearAllMocks();

    txMock.fiado.findMany.mockResolvedValue([
      { id: "f1", saldo: 100, status: "ACTIVO" },
    ]);
    txMock.fiado.updateMany.mockResolvedValue({ count: 0 }); // otro cobro ganó el race

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const result = await FiadosDB.cobrarPorCliente("tenant-1", "987654321", 40);

    expect(txMock.fiadoCuota.create).not.toHaveBeenCalled();
    expect(result.payments).toHaveLength(0);
    expect(result.remaining).toBe(40); // todo el monto quedó sin aplicar
  });

  it("cuando saldo final llega a 0, hace second update con status=PAGADO", async () => {
    vi.clearAllMocks();

    txMock.fiado.findMany.mockResolvedValue([
      { id: "f1", saldo: 50, status: "ACTIVO" },
    ]);
    txMock.fiado.updateMany.mockResolvedValue({ count: 1 });
    txMock.fiado.findFirst.mockResolvedValue({ saldo: 0 }); // queda en 0

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.cobrarPorCliente("tenant-1", "987654321", 50);

    // updateMany decrement + update status=PAGADO
    expect(txMock.fiado.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.fiado.update).toHaveBeenCalledTimes(1);
    expect(txMock.fiado.update.mock.calls[0][0].data).toEqual({ status: "PAGADO" });
  });

  it("regresión: NUNCA usa update con `saldo: <number>` (anti SET con valor leído)", async () => {
    vi.clearAllMocks();

    txMock.fiado.findMany.mockResolvedValue([
      { id: "f1", saldo: 100, status: "ACTIVO" },
    ]);
    txMock.fiado.updateMany.mockResolvedValue({ count: 1 });
    txMock.fiado.findFirst.mockResolvedValue({ saldo: 70 });

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.cobrarPorCliente("tenant-1", "987654321", 30);

    // Si setea saldo, DEBE ser objeto con decrement (no un número plain)
    for (const call of [...txMock.fiado.update.mock.calls, ...txMock.fiado.updateMany.mock.calls]) {
      const saldoData = call[0]?.data?.saldo;
      if (saldoData != null) {
        expect(typeof saldoData).toBe("object");
        expect(saldoData).toHaveProperty("decrement");
      }
    }
  });
});
