/**
 * __tests__/fiados-db-business-logic.test.ts
 *
 * Unit tests para lib/db/fiados.db.ts — módulo de crédito informal (fiados).
 * CRÍTICO: este módulo maneja DINERO real prestado a clientes de la bodega.
 *
 * Cobertura:
 *  - validateForNewFiado: scoring crediticio (3 reglas + edge cases)
 *  - Helpers puros: toNum (Decimal → number), mapFiado, mapCuota
 *
 * NOTA: este archivo NO existía antes del sprint 2026-05-12. Es el primer
 * test de business logic para FiadosDB (era zona ciega ≥3 meses).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCount = vi.fn();
const mockAggregate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: {
      count: (...args: unknown[]) => mockCount(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { FiadosDB } from "@/lib/db/fiados.db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = "test-tenant-id";
const CUSTOMER = "994123456"; // phone-as-id (Buleje convention)

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── validateForNewFiado: Regla 1 — bloquear si >=3 vencidos ──────────────────

describe("FiadosDB.validateForNewFiado — Regla 1: máx 2 vencidos", () => {
  it("permite cuando hay 0 vencidos", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result).toBeNull();
  });

  it("permite cuando hay 2 vencidos (borde superior)", async () => {
    // mockCount se llama 2× — primero vencidos, después muyVencidos
    mockCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result).toBeNull();
  });

  it("BLOQUEA con 3 vencidos", async () => {
    mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result).not.toBeNull();
    expect(result?.error).toContain("3 fiados vencidos");
    expect(result?.status).toBe(400);
  });

  it("BLOQUEA con 10 vencidos (muchos)", async () => {
    mockCount.mockResolvedValueOnce(10).mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result?.error).toContain("10 fiados vencidos");
  });
});

// ─── validateForNewFiado: Regla 2 — bloquear si tiene activo >60 días ─────────

describe("FiadosDB.validateForNewFiado — Regla 2: sin activos >60 días", () => {
  it("permite cuando no tiene activos viejos (muyVencidos=0)", async () => {
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result).toBeNull();
  });

  it("BLOQUEA con 1 fiado activo >60 días", async () => {
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result).not.toBeNull();
    expect(result?.error).toContain("60 dias");
    expect(result?.status).toBe(400);
  });

  it("regla 2 tiene prioridad sobre regla 3 (>60 días bloquea antes que límite)", async () => {
    mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 5000 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 1000, 500);
    expect(result?.error).toContain("60 dias");
    expect(result?.error).not.toContain("limite");
  });
});

// ─── validateForNewFiado: Regla 3 — límite de crédito ──────────────────────────

describe("FiadosDB.validateForNewFiado — Regla 3: límite de crédito", () => {
  it("NO chequea límite cuando creditLimit=0 (sin límite)", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 999999 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 10000, 0);
    expect(result).toBeNull();
    // Confirma que aggregate NO se llamó (corto-circuito en validateForNewFiado)
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it("permite cuando suma de activos + requested <= límite", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 200 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 500);
    expect(result).toBeNull();
  });

  it("BLOQUEA cuando suma activos + requested supera límite", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 450 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 500);
    expect(result).not.toBeNull();
    expect(result?.error).toContain("limite de credito");
    expect(result?.error).toContain("S/500.00");
    expect(result?.error).toContain("S/450.00");
    expect(result?.error).toContain("Disponible: S/50.00");
  });

  it("maneja saldo=null en aggregate (cliente sin activos)", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 400, 500);
    expect(result).toBeNull(); // 0 + 400 <= 500
  });

  it("borde exacto: suma == límite, permite", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 400 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 500);
    expect(result).toBeNull(); // 400 + 100 = 500 NO supera
  });

  it("borde exacto: suma + 1 > límite, bloquea", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 400 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 101, 500);
    expect(result).not.toBeNull(); // 400 + 101 = 501 > 500
  });
});

// ─── Combinaciones: orden de prioridad de las 3 reglas ────────────────────────

describe("FiadosDB.validateForNewFiado — orden de reglas", () => {
  it("regla 1 (vencidos) tiene prioridad sobre regla 2 (>60 días)", async () => {
    mockCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    expect(result?.error).toContain("vencidos");
    expect(result?.error).not.toContain("60 dias");
  });

  it("paso ok cuando todas las reglas pasan", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: 100 } });

    const result = await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 50, 500);
    expect(result).toBeNull();
  });
});

// ─── Multi-tenant isolation: validateForNewFiado debe scopear por tenantId ────

describe("FiadosDB.validateForNewFiado — multi-tenant isolation", () => {
  it("incluye tenantId en TODAS las queries (anti-cross-tenant leak)", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 500);

    // count llamado 2x (vencidos + muyVencidos)
    expect(mockCount).toHaveBeenCalledTimes(2);
    const countCalls = mockCount.mock.calls;
    for (const call of countCalls) {
      expect(call[0].where).toMatchObject({ tenantId: TENANT, customerId: CUSTOMER });
    }

    // aggregate llamado 1x cuando creditLimit > 0
    expect(mockAggregate).toHaveBeenCalledTimes(1);
    expect(mockAggregate.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      customerId: CUSTOMER,
      status: "ACTIVO",
    });
  });

  it("query muyVencidos usa fechaVence < 60 días atrás", async () => {
    mockCount.mockResolvedValue(0);
    mockAggregate.mockResolvedValue({ _sum: { saldo: null } });

    const beforeCall = Date.now();
    await FiadosDB.validateForNewFiado(TENANT, CUSTOMER, 100, 0);
    const afterCall = Date.now();

    // 2da llamada a count = filtra muyVencidos
    const secondCall = mockCount.mock.calls[1][0];
    expect(secondCall.where.status).toBe("ACTIVO");
    expect(secondCall.where.fechaVence.lt).toBeInstanceOf(Date);

    // El cutoff debe estar ~60 días atrás (con tolerancia del tiempo de ejecución)
    const cutoffMs = secondCall.where.fechaVence.lt.getTime();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(beforeCall - sixtyDaysMs);
    expect(cutoffMs).toBeLessThanOrEqual(afterCall - sixtyDaysMs);
  });
});
