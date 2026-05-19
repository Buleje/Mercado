/**
 * __tests__/prestamos-db-business-logic.test.ts
 *
 * Unit tests para lib/db/prestamos.db.ts — préstamos personales (BNPL).
 * CRÍTICO: este módulo maneja DEUDAS de clientes y entidades hacia/desde la bodega.
 *
 * Cobertura:
 *  - addDocumento / listDocumentos / deleteDocumento (cross-tenant guards)
 *  - getCuotasProximas (separación vencidas/próximas + cálculo días)
 *  - marcarVencidos (cron job — marca préstamos como VENCIDO atomically)
 *
 * NOTA: 701 LOC del archivo · este es el primer test del módulo (zona ciega).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrestamoFindFirst = vi.fn();
const mockDocCreate = vi.fn();
const mockDocFindMany = vi.fn();
const mockDocFindFirst = vi.fn();
const mockDocDeleteMany = vi.fn();
const mockCuotaFindMany = vi.fn();
const mockPrestamoUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prestamo: {
      findFirst: (...args: unknown[]) => mockPrestamoFindFirst(...args),
      updateMany: (...args: unknown[]) => mockPrestamoUpdateMany(...args),
    },
    prestamoDocumento: {
      create: (...args: unknown[]) => mockDocCreate(...args),
      findMany: (...args: unknown[]) => mockDocFindMany(...args),
      findFirst: (...args: unknown[]) => mockDocFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockDocDeleteMany(...args),
    },
    prestamoCuota: {
      findMany: (...args: unknown[]) => mockCuotaFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PrestamosDB } from "@/lib/db/prestamos.db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = "test-tenant";
const OTHER_TENANT = "otro-tenant";
const PRESTAMO_ID = "prestamo-abc";
const DOC_ID = "doc-xyz";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── addDocumento — cross-tenant guard ────────────────────────────────────────

describe("PrestamosDB.addDocumento — cross-tenant guard", () => {
  it("crea documento cuando el préstamo existe y pertenece al tenant", async () => {
    mockPrestamoFindFirst.mockResolvedValue({ id: PRESTAMO_ID });
    mockDocCreate.mockResolvedValue({
      id: DOC_ID,
      prestamoId: PRESTAMO_ID,
      nombre: "contrato.pdf",
      tipo: "pdf",
      url: "https://storage/contrato.pdf",
      createdAt: new Date("2026-05-12T10:00:00Z"),
    });

    const result = await PrestamosDB.addDocumento(TENANT, PRESTAMO_ID, {
      nombre: "contrato.pdf",
      tipo: "pdf",
      url: "https://storage/contrato.pdf",
    });

    expect(result.id).toBe(DOC_ID);
    expect(result.nombre).toBe("contrato.pdf");
    expect(mockPrestamoFindFirst.mock.calls[0][0].where).toMatchObject({
      id: PRESTAMO_ID,
      tenantId: TENANT,
    });
  });

  it("LANZA error si el préstamo no existe (anti-cross-tenant write)", async () => {
    mockPrestamoFindFirst.mockResolvedValue(null);

    await expect(
      PrestamosDB.addDocumento(OTHER_TENANT, PRESTAMO_ID, {
        nombre: "ataque.pdf",
        tipo: "pdf",
        url: "https://atacante.com/x.pdf",
      })
    ).rejects.toThrow(/no encontrado|acceso denegado/i);

    // create NO debe llamarse si falla el guard
    expect(mockDocCreate).not.toHaveBeenCalled();
  });
});

// ─── listDocumentos — cross-tenant guard ──────────────────────────────────────

describe("PrestamosDB.listDocumentos — cross-tenant guard", () => {
  it("retorna documentos cuando el préstamo es del tenant", async () => {
    mockPrestamoFindFirst.mockResolvedValue({ id: PRESTAMO_ID });
    mockDocFindMany.mockResolvedValue([
      {
        id: "d1",
        prestamoId: PRESTAMO_ID,
        nombre: "factura.pdf",
        tipo: "pdf",
        url: "u1",
        createdAt: new Date(),
      },
      {
        id: "d2",
        prestamoId: PRESTAMO_ID,
        nombre: "voucher.jpg",
        tipo: "image",
        url: "u2",
        createdAt: new Date(),
      },
    ]);

    const result = await PrestamosDB.listDocumentos(TENANT, PRESTAMO_ID);
    expect(result).toHaveLength(2);
    expect(result[0].nombre).toBe("factura.pdf");
  });

  it("retorna [] si el préstamo NO pertenece al tenant (silent fail, no leak)", async () => {
    mockPrestamoFindFirst.mockResolvedValue(null);
    const result = await PrestamosDB.listDocumentos(OTHER_TENANT, PRESTAMO_ID);
    expect(result).toEqual([]);
    // findMany NO debe llamarse para evitar fuga
    expect(mockDocFindMany).not.toHaveBeenCalled();
  });
});

// ─── deleteDocumento — cross-tenant guard ─────────────────────────────────────

describe("PrestamosDB.deleteDocumento — cross-tenant guard", () => {
  it("elimina cuando el documento pertenece al tenant", async () => {
    mockDocFindFirst.mockResolvedValue({ id: DOC_ID });
    mockDocDeleteMany.mockResolvedValue({ count: 1 });

    const result = await PrestamosDB.deleteDocumento(TENANT, DOC_ID);
    expect(result).toBe(true);
    // WHERE debe usar relation prestamo.tenantId (cross-tenant defense)
    expect(mockDocFindFirst.mock.calls[0][0].where).toMatchObject({
      id: DOC_ID,
      prestamo: { tenantId: TENANT },
    });
  });

  it("retorna false si el documento NO pertenece al tenant", async () => {
    mockDocFindFirst.mockResolvedValue(null);
    const result = await PrestamosDB.deleteDocumento(OTHER_TENANT, DOC_ID);
    expect(result).toBe(false);
    expect(mockDocDeleteMany).not.toHaveBeenCalled();
  });

  it("retorna false ante excepción de DB (graceful fail)", async () => {
    mockDocFindFirst.mockRejectedValue(new Error("DB connection lost"));
    const result = await PrestamosDB.deleteDocumento(TENANT, DOC_ID);
    expect(result).toBe(false);
  });
});

// ─── getCuotasProximas — separación vencidas/próximas + cálculo días ──────────

describe("PrestamosDB.getCuotasProximas — clasificación vencidas vs próximas", () => {
  const NOW = new Date("2026-05-12T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEachCleanup();

  function afterEachCleanup() {
    // Hack para usar afterEach en testing v4 estilo
  }

  it("retorna estructura {vencidas: [], proximas: []} cuando no hay cuotas", async () => {
    mockCuotaFindMany.mockResolvedValue([]);
    const result = await PrestamosDB.getCuotasProximas(TENANT);
    expect(result).toEqual({ vencidas: [], proximas: [] });
  });

  it("clasifica cuota con fechaVence anterior a hoy como VENCIDA con diasAtraso", async () => {
    const fechaVence = new Date("2026-05-09T12:00:00Z"); // 3 días atrás
    mockCuotaFindMany.mockResolvedValue([
      {
        id: "c1",
        numeroCuota: 1,
        monto: 100,
        fechaVence,
        prestamo: {
          id: "p1",
          customerId: "994111111",
          entidadNombre: null,
          moneda: "PEN",
          customer: { name: "Juan Pérez" },
        },
      },
    ]);
    const result = await PrestamosDB.getCuotasProximas(TENANT);
    expect(result.vencidas).toHaveLength(1);
    expect(result.proximas).toHaveLength(0);
    expect(result.vencidas[0].diasAtraso).toBe(3);
    expect(result.vencidas[0].nombre).toBe("Juan Pérez");
    expect(result.vencidas[0].monto).toBe(100);
  });

  it("clasifica cuota con fechaVence futura como PRÓXIMA con diasRestantes", async () => {
    const fechaVence = new Date("2026-05-22T12:00:00Z"); // 10 días adelante
    mockCuotaFindMany.mockResolvedValue([
      {
        id: "c2",
        numeroCuota: 2,
        monto: 50,
        fechaVence,
        prestamo: {
          id: "p2",
          customerId: "994222222",
          entidadNombre: null,
          moneda: "PEN",
          customer: { name: "Maria López" },
        },
      },
    ]);
    const result = await PrestamosDB.getCuotasProximas(TENANT);
    expect(result.vencidas).toHaveLength(0);
    expect(result.proximas).toHaveLength(1);
    expect(result.proximas[0].diasRestantes).toBe(10);
  });

  it("fallback de nombre: entidadNombre > customerId si no hay customer.name", async () => {
    mockCuotaFindMany.mockResolvedValue([
      {
        id: "c3",
        numeroCuota: 1,
        monto: 100,
        fechaVence: new Date("2026-05-15T12:00:00Z"),
        prestamo: {
          id: "p3",
          customerId: "994333333",
          entidadNombre: "Banco BCP",
          moneda: "USD",
          customer: null,
        },
      },
    ]);
    const result = await PrestamosDB.getCuotasProximas(TENANT);
    expect(result.proximas[0].nombre).toBe("Banco BCP");
    expect(result.proximas[0].moneda).toBe("USD");
  });

  it("WHERE pagadoEn=null + status in ACTIVO/VENCIDO (no incluye PAGADO)", async () => {
    mockCuotaFindMany.mockResolvedValue([]);
    await PrestamosDB.getCuotasProximas(TENANT);
    const where = mockCuotaFindMany.mock.calls[0][0].where;
    expect(where.pagadoEn).toBeNull();
    expect(where.prestamo.tenantId).toBe(TENANT);
    expect(where.prestamo.status.in).toEqual(["ACTIVO", "VENCIDO"]);
  });
});

// ─── marcarVencidos — cron job atomic update ──────────────────────────────────

describe("PrestamosDB.marcarVencidos — cron job", () => {
  it("retorna 0 cuando no hay cuotas vencidas", async () => {
    mockCuotaFindMany.mockResolvedValue([]);
    const count = await PrestamosDB.marcarVencidos(TENANT);
    expect(count).toBe(0);
    expect(mockPrestamoUpdateMany).not.toHaveBeenCalled();
  });

  it("marca préstamos como VENCIDO atomically (1 sola updateMany)", async () => {
    mockCuotaFindMany.mockResolvedValue([
      { prestamoId: "p1" },
      { prestamoId: "p2" },
    ]);
    mockPrestamoUpdateMany.mockResolvedValue({ count: 2 });

    const count = await PrestamosDB.marcarVencidos(TENANT);
    expect(count).toBe(2);

    expect(mockPrestamoUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockPrestamoUpdateMany.mock.calls[0][0].where.id.in).toEqual(["p1", "p2"]);
    expect(mockPrestamoUpdateMany.mock.calls[0][0].where.tenantId).toBe(TENANT);
    expect(mockPrestamoUpdateMany.mock.calls[0][0].where.status).toBe("ACTIVO");
    expect(mockPrestamoUpdateMany.mock.calls[0][0].data).toMatchObject({
      status: "VENCIDO",
    });
  });

  it("findMany con distinct prestamoId (evita duplicados N×cuotas)", async () => {
    mockCuotaFindMany.mockResolvedValue([]);
    await PrestamosDB.marcarVencidos(TENANT);
    expect(mockCuotaFindMany.mock.calls[0][0].distinct).toEqual(["prestamoId"]);
    expect(mockCuotaFindMany.mock.calls[0][0].select).toEqual({ prestamoId: true });
  });

  it("WHERE de findMany: solo cuotas no pagadas + fechaVence < ahora + tenant", async () => {
    mockCuotaFindMany.mockResolvedValue([]);
    const before = Date.now();
    await PrestamosDB.marcarVencidos(TENANT);
    const after = Date.now();

    const where = mockCuotaFindMany.mock.calls[0][0].where;
    expect(where.pagadoEn).toBeNull();
    expect(where.fechaVence.lt).toBeInstanceOf(Date);
    expect(where.fechaVence.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.fechaVence.lt.getTime()).toBeLessThanOrEqual(after);
    expect(where.prestamo.tenantId).toBe(TENANT);
    expect(where.prestamo.status).toBe("ACTIVO");
  });
});
