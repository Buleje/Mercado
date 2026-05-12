/**
 * __tests__/turnos-db-business-logic.test.ts
 *
 * Unit tests para lib/db/turnos.db.ts — cierre de caja diario.
 * CRÍTICO: este módulo maneja el flujo de efectivo de la bodega.
 *
 * Cobertura:
 *  - getActivo: filtrado correcto + multi-caja support
 *  - abrir: creación con campos opcionales
 *  - cerrar: optimistic lock (race condition prevention)
 *  - list: filtros + tenant scoping
 *
 * NOTA: este archivo NO existía. Primer test de business logic para TurnosDB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    turno: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { TurnosDB } from "@/lib/db/turnos.db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = "test-tenant";
const ADMIN = "admin-user-id";
const TURNO_ID = "turno-abc-123";
const REGISTER_A = "register-a";
const REGISTER_B = "register-b";

const makeTurnoRow = (overrides: Record<string, unknown> = {}) => ({
  id: TURNO_ID,
  tenantId: TENANT,
  adminUserId: ADMIN,
  cashRegisterId: null,
  inicioEfectivo: 100,
  cierreEfectivo: null,
  ventasTotal: 0,
  status: "ABIERTO",
  abrioEn: new Date("2026-05-12T08:00:00Z"),
  cerroEn: null,
  notas: null,
  createdAt: new Date("2026-05-12T08:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: transaction passes through (callback gets a tx with same methods)
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    return fn({
      turno: {
        updateMany: mockUpdateMany,
        findUnique: mockFindUnique,
      },
    });
  });
});

// ─── getActivo ────────────────────────────────────────────────────────────────

describe("TurnosDB.getActivo", () => {
  it("retorna null si no hay turno abierto", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await TurnosDB.getActivo(TENANT, ADMIN);
    expect(result).toBeNull();
  });

  it("retorna turno mapped cuando existe", async () => {
    mockFindFirst.mockResolvedValue(makeTurnoRow());
    const result = await TurnosDB.getActivo(TENANT, ADMIN);
    expect(result?.id).toBe(TURNO_ID);
    expect(result?.status).toBe("ABIERTO");
    expect(result?.inicioEfectivo).toBe(100);
  });

  it("scopea por tenantId + adminUserId + status ABIERTO", async () => {
    mockFindFirst.mockResolvedValue(null);
    await TurnosDB.getActivo(TENANT, ADMIN);
    expect(mockFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      adminUserId: ADMIN,
      status: "ABIERTO",
    });
  });

  it("multi-caja: incluye cashRegisterId cuando se pasa", async () => {
    mockFindFirst.mockResolvedValue(null);
    await TurnosDB.getActivo(TENANT, ADMIN, REGISTER_A);
    expect(mockFindFirst.mock.calls[0][0].where).toMatchObject({
      cashRegisterId: REGISTER_A,
    });
  });

  it("multi-caja: SIN cashRegisterId no incluye el filtro (legacy single-cash)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await TurnosDB.getActivo(TENANT, ADMIN);
    const where = mockFindFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("cashRegisterId");
  });

  it("ordena por abrioEn desc (el más reciente primero)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await TurnosDB.getActivo(TENANT, ADMIN);
    expect(mockFindFirst.mock.calls[0][0].orderBy).toEqual({ abrioEn: "desc" });
  });
});

// ─── abrir ────────────────────────────────────────────────────────────────────

describe("TurnosDB.abrir", () => {
  it("crea turno con campos básicos", async () => {
    mockCreate.mockResolvedValue(makeTurnoRow());
    const result = await TurnosDB.abrir({
      tenantId: TENANT,
      adminUserId: ADMIN,
      inicioEfectivo: 200,
    });
    expect(result.id).toBe(TURNO_ID);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: TENANT,
        adminUserId: ADMIN,
        cashRegisterId: null,
        inicioEfectivo: 200,
      }),
    });
  });

  it("acepta cashRegisterId opcional para multi-caja", async () => {
    mockCreate.mockResolvedValue(makeTurnoRow({ cashRegisterId: REGISTER_B }));
    await TurnosDB.abrir({
      tenantId: TENANT,
      adminUserId: ADMIN,
      inicioEfectivo: 0,
      cashRegisterId: REGISTER_B,
    });
    expect(mockCreate.mock.calls[0][0].data.cashRegisterId).toBe(REGISTER_B);
  });

  it("inicioEfectivo=0 es válido (turno empezando vacío)", async () => {
    mockCreate.mockResolvedValue(makeTurnoRow({ inicioEfectivo: 0 }));
    const result = await TurnosDB.abrir({
      tenantId: TENANT,
      adminUserId: ADMIN,
      inicioEfectivo: 0,
    });
    expect(result.inicioEfectivo).toBe(0);
  });
});

// ─── cerrar (optimistic lock — CRÍTICO contra race conditions) ────────────────

describe("TurnosDB.cerrar — optimistic lock", () => {
  it("cierra exitosamente cuando turno está ABIERTO", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue(
      makeTurnoRow({
        status: "CERRADO",
        cierreEfectivo: 500,
        ventasTotal: 400,
        cerroEn: new Date(),
      })
    );

    const result = await TurnosDB.cerrar(TURNO_ID, TENANT, {
      cierreEfectivo: 500,
      ventasTotal: 400,
    });

    expect(result?.status).toBe("CERRADO");
    expect(result?.cierreEfectivo).toBe(500);
    expect(result?.ventasTotal).toBe(400);
  });

  it("RACE CONDITION: retorna null si otro request ya cerró el turno", async () => {
    // updateMany count=0 significa que el WHERE no matcheo
    // (turno ya está CERRADO por otra request concurrent)
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await TurnosDB.cerrar(TURNO_ID, TENANT, {
      cierreEfectivo: 500,
      ventasTotal: 400,
    });

    expect(result).toBeNull();
    // findUnique NO debe llamarse si updateMany falla
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("WHERE incluye status=ABIERTO (optimistic lock)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await TurnosDB.cerrar(TURNO_ID, TENANT, {
      cierreEfectivo: 100,
      ventasTotal: 100,
    });
    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: TURNO_ID,
      tenantId: TENANT,
      status: "ABIERTO", // ← clave: previene doble cierre
    });
  });

  it("WHERE incluye tenantId (anti-cross-tenant)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await TurnosDB.cerrar(TURNO_ID, "OTRO_TENANT", {
      cierreEfectivo: 100,
      ventasTotal: 100,
    });
    expect(mockUpdateMany.mock.calls[0][0].where.tenantId).toBe("OTRO_TENANT");
  });

  it("setea cerroEn = ahora", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue(makeTurnoRow({ status: "CERRADO" }));

    const beforeCall = Date.now();
    await TurnosDB.cerrar(TURNO_ID, TENANT, { cierreEfectivo: 100, ventasTotal: 0 });
    const afterCall = Date.now();

    const updateData = mockUpdateMany.mock.calls[0][0].data;
    expect(updateData.cerroEn).toBeInstanceOf(Date);
    expect(updateData.cerroEn.getTime()).toBeGreaterThanOrEqual(beforeCall);
    expect(updateData.cerroEn.getTime()).toBeLessThanOrEqual(afterCall);
  });

  it("notas opcional: NO se incluye si no se pasa", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue(makeTurnoRow({ status: "CERRADO" }));

    await TurnosDB.cerrar(TURNO_ID, TENANT, { cierreEfectivo: 100, ventasTotal: 50 });
    const updateData = mockUpdateMany.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("notas");
  });

  it("notas se incluye cuando se pasa", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue(makeTurnoRow({ status: "CERRADO" }));

    await TurnosDB.cerrar(TURNO_ID, TENANT, {
      cierreEfectivo: 100,
      ventasTotal: 50,
      notas: "cierre normal sin novedades",
    });
    expect(mockUpdateMany.mock.calls[0][0].data.notas).toBe(
      "cierre normal sin novedades"
    );
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe("TurnosDB.list", () => {
  it("retorna lista vacía si no hay turnos", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await TurnosDB.list(TENANT);
    expect(result).toEqual([]);
  });

  it("mapea cada turno con mapTurno", async () => {
    mockFindMany.mockResolvedValue([
      makeTurnoRow({ id: "t1", status: "ABIERTO" }),
      makeTurnoRow({ id: "t2", status: "CERRADO", cierreEfectivo: 200 }),
    ]);
    const result = await TurnosDB.list(TENANT);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1");
    expect(result[1].cierreEfectivo).toBe(200);
  });

  it("scopea por tenantId siempre", async () => {
    mockFindMany.mockResolvedValue([]);
    await TurnosDB.list(TENANT);
    expect(mockFindMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
  });

  it("filtros opcionales: status", async () => {
    mockFindMany.mockResolvedValue([]);
    await TurnosDB.list(TENANT, { status: "ABIERTO" });
    expect(mockFindMany.mock.calls[0][0].where.status).toBe("ABIERTO");
  });

  it("filtros opcionales: adminUserId", async () => {
    mockFindMany.mockResolvedValue([]);
    await TurnosDB.list(TENANT, { adminUserId: ADMIN });
    expect(mockFindMany.mock.calls[0][0].where.adminUserId).toBe(ADMIN);
  });

  it("sin filtros: solo tenantId", async () => {
    mockFindMany.mockResolvedValue([]);
    await TurnosDB.list(TENANT);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where).toEqual({ tenantId: TENANT });
  });

  it("ordena por abrioEn desc", async () => {
    mockFindMany.mockResolvedValue([]);
    await TurnosDB.list(TENANT);
    expect(mockFindMany.mock.calls[0][0].orderBy).toEqual({ abrioEn: "desc" });
  });
});
