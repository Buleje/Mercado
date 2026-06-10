/**
 * withRlsTx (TD-116) — garantiza SET LOCAL + queries en UNA transacción.
 * El aislamiento SQL real se verificó contra prod como rol buleje_app
 * (2026-06-10); estos tests cubren el contrato del wrapper.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeRawCalls, mockTx, mockPrisma } = vi.hoisted(() => {
  const executeRawCalls: string[] = [];
  const mockTx = {
    $executeRawUnsafe: async (sql: string) => {
      executeRawCalls.push(sql);
      return 0;
    },
    order: { findMany: async () => [{ id: "o1" }] },
  };
  const mockPrisma: Record<string, unknown> = {
    $transaction: async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  };
  return { executeRawCalls, mockTx, mockPrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("server-only", () => ({}));

import { withRlsTx } from "@/lib/prisma-rls";

describe("withRlsTx", () => {
  let txCalls = 0;
  beforeEach(() => {
    executeRawCalls.length = 0;
    txCalls = 0;
    mockPrisma.$transaction = async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
      txCalls += 1;
      return cb(mockTx);
    };
  });

  it("ejecuta SET LOCAL app.tenant_id ANTES de la query, dentro de la tx", async () => {
    const result = await withRlsTx("tenant-abc", async (tx) => {
      // en el momento de la query, el SET LOCAL ya debe haberse emitido
      expect(executeRawCalls).toEqual(["SET LOCAL app.tenant_id = 'tenant-abc'"]);
      return (tx as unknown as typeof mockTx).order.findMany();
    });
    expect(result).toEqual([{ id: "o1" }]);
    expect(txCalls).toBe(1);
  });

  it("propaga el valor de retorno del callback", async () => {
    const out = await withRlsTx("t1", async () => ({ ok: true, n: 42 }));
    expect(out).toEqual({ ok: true, n: 42 });
  });

  it("escapa comillas simples en tenantId (anti SQLi en SET LOCAL)", async () => {
    await withRlsTx("o'malley", async () => null);
    expect(executeRawCalls[0]).toBe("SET LOCAL app.tenant_id = 'o''malley'");
  });

  it("rechaza tenantId vacío o whitespace", async () => {
    await expect(withRlsTx("", async () => null)).rejects.toThrow(/tenantId vacío/);
    await expect(withRlsTx("   ", async () => null)).rejects.toThrow(/tenantId vacío/);
  });

  it("propaga errores del callback (la tx hace rollback en prod)", async () => {
    await expect(
      withRlsTx("t1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("fallback para mocks sin $transaction: ejecuta fn directo contra el client", async () => {
    delete mockPrisma.$transaction;
    (mockPrisma as Record<string, unknown>).order = { count: async () => 7 };
    const out = await withRlsTx("t1", async (tx) =>
      (tx as unknown as { order: { count: () => Promise<number> } }).order.count(),
    );
    expect(out).toBe(7);
    // sin tx no se emite SET LOCAL (los unit tests no validan RLS)
    expect(executeRawCalls).toEqual([]);
  });
});
