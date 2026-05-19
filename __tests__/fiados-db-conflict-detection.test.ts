/**
 * FiadosDB — conflict detection & resumenByCustomer (P1-3, P1-4, P1-5).
 *
 * Audit 2026-05-17:
 * - isPrismaConflict: detección de race-conditions de Prisma/Postgres
 * - FiadoConflictError: clase de error propagable a 409 Conflict
 * - resumenByCustomer: lógica antes inline en /api/customers/[phone]/fiado-resumen
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("FiadosDB — isPrismaConflict (P1-3)", () => {
  it("matchea Prisma P2034 (TransactionConflict)", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    const err = Object.assign(new Error("transaction failed"), { code: "P2034" });
    expect(isPrismaConflict(err)).toBe(true);
  });

  it("matchea Postgres SQLSTATE 40001 (serialization)", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    const err = new Error("ERROR: could not serialize access due to concurrent update (SQLSTATE 40001)");
    expect(isPrismaConflict(err)).toBe(true);
  });

  it("matchea Postgres SQLSTATE 40P01 (deadlock)", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    const err = new Error("deadlock detected (40P01)");
    expect(isPrismaConflict(err)).toBe(true);
  });

  it("matchea texto 'transaction conflict' sin código", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    const err = new Error("write transaction conflict in retry");
    expect(isPrismaConflict(err)).toBe(true);
  });

  it("NO matchea errores de conexión (no son race)", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    expect(isPrismaConflict(new Error("ECONNREFUSED"))).toBe(false);
    expect(isPrismaConflict(new Error("connection timeout"))).toBe(false);
  });

  it("NO matchea errores arbitrarios", async () => {
    const { isPrismaConflict } = await import("@/lib/db/fiados.db");
    expect(isPrismaConflict(new Error("Validation failed"))).toBe(false);
    expect(isPrismaConflict("not even an error")).toBe(false);
    expect(isPrismaConflict(null)).toBe(false);
  });
});

describe("FiadosDB — FiadoConflictError", () => {
  it("tiene code='FIADO_CONFLICT' y name='FiadoConflictError'", async () => {
    const { FiadoConflictError } = await import("@/lib/db/fiados.db");
    const err = new FiadoConflictError("test");
    expect(err.code).toBe("FIADO_CONFLICT");
    expect(err.name).toBe("FiadoConflictError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("FiadosDB — resumenByCustomer (P1-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna ceros cuando el cliente no tiene fiados activos", async () => {
    const { prisma } = await import("@/lib/prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.aggregate as any).mockResolvedValue({ _sum: { saldo: null }, _count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.findFirst as any).mockResolvedValue(null);

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const result = await FiadosDB.resumenByCustomer("tenant-1", "987654321");

    expect(result).toEqual({
      montoPendiente: 0,
      cantidadFiados: 0,
      diasVencido: 0,
      hasFiadosVencidos: false,
    });
  });

  it("incluye tenantId + customerId + status=ACTIVO en aggregate y findFirst", async () => {
    const { prisma } = await import("@/lib/prisma");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.aggregate as any).mockResolvedValue({ _sum: { saldo: 150.5 }, _count: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.findFirst as any).mockResolvedValue({
      createdAt: new Date(),
      fechaVence: null,
    });

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    await FiadosDB.resumenByCustomer("tenant-a", "999111111");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.fiado.aggregate as any).mock.calls[0][0]).toMatchObject({
      where: { tenantId: "tenant-a", customerId: "999111111", status: "ACTIVO" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.fiado.findFirst as any).mock.calls[0][0]).toMatchObject({
      where: { tenantId: "tenant-a", customerId: "999111111", status: "ACTIVO" },
    });
  });

  it("marca hasFiadosVencidos=true cuando fechaVence está en el pasado", async () => {
    const { prisma } = await import("@/lib/prisma");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.aggregate as any).mockResolvedValue({ _sum: { saldo: 50 }, _count: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.fiado.findFirst as any).mockResolvedValue({
      createdAt: yesterday,
      fechaVence: yesterday,
    });

    const { FiadosDB } = await import("@/lib/db/fiados.db");
    const result = await FiadosDB.resumenByCustomer("t1", "999");

    expect(result.hasFiadosVencidos).toBe(true);
    expect(result.montoPendiente).toBe(50);
    expect(result.cantidadFiados).toBe(1);
    expect(result.diasVencido).toBeGreaterThanOrEqual(1);
  });
});
