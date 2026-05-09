/**
 * TEST B2 — extractTenantId + complianceAuditExtension early-return
 *
 * Verifica comportamiento de la funcion privada extractTenantId y que
 * complianceAuditExtension hace early-return + warn cuando tenantId es null.
 *
 * extractTenantId no esta exportada — la testeamos a traves de la extension.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockLoggerWarn  = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  mockLoggerWarn,
    error: mockLoggerError,
  },
}));

// hash-chain puede ser no-op en tests
vi.mock("@/lib/audit/hash-chain", () => ({
  calculateHash:  vi.fn(() => "test-hash-abc"),
  buildHashData:  vi.fn((x: unknown) => JSON.stringify(x)),
}));

// cache no debe tocar Redis en unit tests
vi.mock("@/lib/cache", () => ({
  cacheStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

// Prisma solo para el import — no llega a ejecutarse
vi.mock("@/lib/generated/prisma/client", () => ({
  Prisma: {
    defineExtension: vi.fn((def: unknown) => def),
  },
}));

// ── Import bajo test ──────────────────────────────────────────────────────────

// Importamos el modulo despues de los mocks
import { complianceAuditExtension } from "@/lib/audit/prisma-middleware";

// ── Helper para ejecutar $allOperations del extension ─────────────────────────

type AllOperationsHook = (params: {
  model: string;
  operation: string;
  args: unknown;
  query: (a: unknown) => Promise<unknown>;
}) => Promise<unknown>;

function getOperationsHook(): AllOperationsHook {
  // complianceAuditExtension es el objeto retornado por Prisma.defineExtension
  // En nuestro mock defineExtension devuelve la definicion directamente
  const ext = complianceAuditExtension as unknown as {
    query: { $allOperations: AllOperationsHook };
  };
  return ext.query.$allOperations;
}

describe("B2 — extractTenantId en complianceAuditExtension", () => {
  const hook = getOperationsHook();
  const noopQuery = vi.fn(async (a: unknown) => a);

  beforeEach(() => {
    mockLoggerWarn.mockClear();
    mockLoggerError.mockClear();
    noopQuery.mockClear();
    // globalThis.prisma necesario para writeAuditEntry — en este test
    // no queremos que llegue tan lejos; el early-return deberia saltar antes.
    (globalThis as unknown as { prisma: unknown }).prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    };
  });

  // ── Casos donde extractTenantId encuentra el tenantId ─────────────────────

  it("query con where.tenantId — no emite warn, continua con la query", async () => {
    await hook({
      model:     "Order",
      operation: "create",
      args:      { where: { tenantId: "tenant-abc" }, data: { total: 10 } },
      query:     noopQuery,
    });

    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("tenantId ausente"),
      expect.anything(),
    );
    expect(noopQuery).toHaveBeenCalledTimes(1);
  });

  it("query create con data.tenantId — extraido desde data (no where)", async () => {
    await hook({
      model:     "Customer",
      operation: "create",
      args:      { data: { tenantId: "tenant-xyz", name: "Juan" } },
      query:     noopQuery,
    });

    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("tenantId ausente"),
      expect.anything(),
    );
    expect(noopQuery).toHaveBeenCalledTimes(1);
  });

  // ── Casos donde extractTenantId retorna null ──────────────────────────────

  it("query sin tenantId en where ni data — warn + early return (no crash)", async () => {
    await hook({
      model:     "Order",
      operation: "update",
      args:      { where: { id: "ord-001" }, data: { status: "entregado" } },
      query:     noopQuery,
    });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("tenantId ausente"),
      expect.objectContaining({ model: "Order", operation: "update" }),
    );
    // La query original si se ejecuto (el early-return es solo del audit, no del query)
    expect(noopQuery).toHaveBeenCalledTimes(1);
  });

  it("args completamente null — no lanza, warn emitido", async () => {
    await expect(
      hook({
        model:     "Sale",
        operation: "create",
        args:      null,
        query:     noopQuery,
      }),
    ).resolves.not.toThrow();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("tenantId ausente"),
      expect.anything(),
    );
  });

  it("args undefined — no lanza, warn emitido", async () => {
    await expect(
      hook({
        model:     "Fiado",
        operation: "delete",
        args:      undefined,
        query:     noopQuery,
      }),
    ).resolves.not.toThrow();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("tenantId ausente"),
      expect.anything(),
    );
  });

  // ── Modelos no sensibles — pass-through sin audit ─────────────────────────

  it("modelo no sensible (Product) — sin warn, query ejecutada directamente", async () => {
    await hook({
      model:     "Product",
      operation: "update",
      args:      { where: { id: "p1" }, data: { stock: 5 } },
      query:     noopQuery,
    });

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(noopQuery).toHaveBeenCalledTimes(1);
  });

  // ── Operaciones de lectura — pass-through sin audit ───────────────────────

  it("lectura (findMany) en modelo sensible — sin audit, sin warn", async () => {
    await hook({
      model:     "Order",
      operation: "findMany",
      args:      { where: { tenantId: "t1" } },
      query:     noopQuery,
    });

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(noopQuery).toHaveBeenCalledTimes(1);
  });

  // ── Verificacion: ?? "unknown" NO aparece (regresion fix B2) ─────────────

  it('el warn NO contiene "unknown" como tenantId — fix B2 en vigor', async () => {
    await hook({
      model:     "Order",
      operation: "update",
      args:      { where: { id: "ord-002" } },
      query:     noopQuery,
    });

    const warnCalls = mockLoggerWarn.mock.calls.flat();
    const warnText  = JSON.stringify(warnCalls);
    expect(warnText).not.toContain('"unknown"');
  });
});
