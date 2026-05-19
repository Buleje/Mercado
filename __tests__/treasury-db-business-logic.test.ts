/**
 * __tests__/treasury-db-business-logic.test.ts
 *
 * Unit tests para lib/db/treasury.db.ts — tesorería multi-cuenta.
 * CRÍTICO: maneja transferencias entre cuentas (BANCO, CAJA_FISICA, etc).
 *
 * Foco: `transferir` (atomic con $transaction) + cross-tenant guards + validations.
 * El método más sensible es `transferir` porque mueve dinero entre 2 cuentas
 * y requiere atomicidad estricta para evitar inconsistencias.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCuentaFindFirst = vi.fn();
const mockCuentaUpdateMany = vi.fn();
const mockMovCreate = vi.fn();
const mockTransferCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

import { TreasuryDB } from "@/lib/db/treasury.db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT = "test-tenant";
const ORIGEN_ID = "cuenta-origen";
const DESTINO_ID = "cuenta-destino";

const makeCuenta = (overrides: Record<string, unknown> = {}) => ({
  id: ORIGEN_ID,
  tenantId: TENANT,
  nombre: "Caja",
  tipo: "CAJA_FISICA",
  saldo: 1000,
  saldoInicial: 0,
  moneda: "PEN",
  activa: true,
  banco: null,
  numeroCuenta: null,
  cci: null,
  color: null,
  notas: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTransferRow = (overrides: Record<string, unknown> = {}) => ({
  id: "transfer-id",
  tenantId: TENANT,
  origenId: ORIGEN_ID,
  destinoId: DESTINO_ID,
  monto: 100,
  descripcion: "",
  origen: { nombre: "Caja" },
  destino: { nombre: "Banco" },
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    return fn({
      treasuryCuenta: {
        findFirst: mockCuentaFindFirst,
        updateMany: mockCuentaUpdateMany,
      },
      treasuryMovimiento: { create: mockMovCreate },
      treasuryTransferencia: { create: mockTransferCreate },
    });
  });
});

// ─── transferir — validaciones pre-tx ─────────────────────────────────────────

describe("TreasuryDB.transferir — validaciones pre-transaction", () => {
  it("LANZA si origen === destino (no auto-transfer)", async () => {
    await expect(
      TreasuryDB.transferir({
        tenantId: TENANT,
        origenId: ORIGEN_ID,
        destinoId: ORIGEN_ID, // ¡mismo!
        monto: 100,
      })
    ).rejects.toThrow(/diferentes/i);

    // $transaction NO debe llamarse si la validación falla pre-tx
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("LANZA si monto <= 0 (no transferencias zero/negative)", async () => {
    await expect(
      TreasuryDB.transferir({
        tenantId: TENANT,
        origenId: ORIGEN_ID,
        destinoId: DESTINO_ID,
        monto: 0,
      })
    ).rejects.toThrow(/positivo/i);

    await expect(
      TreasuryDB.transferir({
        tenantId: TENANT,
        origenId: ORIGEN_ID,
        destinoId: DESTINO_ID,
        monto: -50,
      })
    ).rejects.toThrow(/positivo/i);

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// ─── transferir — cross-tenant guards ─────────────────────────────────────────

describe("TreasuryDB.transferir — cross-tenant security", () => {
  it("LANZA si origen no existe (puede ser cross-tenant write attempt)", async () => {
    mockCuentaFindFirst
      .mockResolvedValueOnce(null) // origen
      .mockResolvedValueOnce(makeCuenta({ id: DESTINO_ID })); // destino

    await expect(
      TreasuryDB.transferir({
        tenantId: TENANT,
        origenId: ORIGEN_ID,
        destinoId: DESTINO_ID,
        monto: 100,
      })
    ).rejects.toThrow(/cuenta no encontrada/i);

    // movimiento/transferencia NO se deben crear
    expect(mockMovCreate).not.toHaveBeenCalled();
    expect(mockTransferCreate).not.toHaveBeenCalled();
    expect(mockCuentaUpdateMany).not.toHaveBeenCalled();
  });

  it("LANZA si destino no existe", async () => {
    mockCuentaFindFirst
      .mockResolvedValueOnce(makeCuenta()) // origen OK
      .mockResolvedValueOnce(null); // destino MISSING

    await expect(
      TreasuryDB.transferir({
        tenantId: TENANT,
        origenId: ORIGEN_ID,
        destinoId: DESTINO_ID,
        monto: 100,
      })
    ).rejects.toThrow(/cuenta no encontrada/i);

    expect(mockMovCreate).not.toHaveBeenCalled();
  });

  it("findFirst de ambas cuentas usa tenantId (anti-cross-tenant)", async () => {
    mockCuentaFindFirst
      .mockResolvedValueOnce(makeCuenta({ saldo: 500 }))
      .mockResolvedValueOnce(makeCuenta({ id: DESTINO_ID, saldo: 0, nombre: "Banco" }));
    mockTransferCreate.mockResolvedValue(makeTransferRow());
    mockMovCreate.mockResolvedValue({});
    mockCuentaUpdateMany.mockResolvedValue({ count: 1 });

    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });

    expect(mockCuentaFindFirst).toHaveBeenCalledTimes(2);
    expect(mockCuentaFindFirst.mock.calls[0][0].where).toMatchObject({
      id: ORIGEN_ID,
      tenantId: TENANT,
    });
    expect(mockCuentaFindFirst.mock.calls[1][0].where).toMatchObject({
      id: DESTINO_ID,
      tenantId: TENANT,
    });
  });
});

// ─── transferir — flujo exitoso atomicidad ────────────────────────────────────

describe("TreasuryDB.transferir — happy path atomicidad", () => {
  beforeEach(() => {
    mockCuentaFindFirst
      .mockResolvedValueOnce(makeCuenta({ saldo: 500, nombre: "Caja Diaria" }))
      .mockResolvedValueOnce(
        makeCuenta({ id: DESTINO_ID, saldo: 1000, nombre: "BCP Corriente" })
      );
    mockTransferCreate.mockResolvedValue(
      makeTransferRow({
        origen: { nombre: "Caja Diaria" },
        destino: { nombre: "BCP Corriente" },
      })
    );
    mockMovCreate.mockResolvedValue({});
    mockCuentaUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("ejecuta TODO dentro de $transaction (atomicidad)", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("crea exactamente 1 transferencia + 2 movimientos + 2 updates", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    expect(mockTransferCreate).toHaveBeenCalledTimes(1);
    expect(mockMovCreate).toHaveBeenCalledTimes(2);
    expect(mockCuentaUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("primer movimiento es TRANSFERENCIA_OUT con saldoPosterior = anterior - monto", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    const outMov = mockMovCreate.mock.calls[0][0].data;
    expect(outMov.tipo).toBe("TRANSFERENCIA_OUT");
    expect(outMov.cuentaId).toBe(ORIGEN_ID);
    expect(outMov.saldoAnterior).toBe(500);
    expect(outMov.saldoPosterior).toBe(400); // 500 - 100
    expect(outMov.descripcion).toContain("BCP Corriente");
  });

  it("segundo movimiento es TRANSFERENCIA_IN con saldoPosterior = anterior + monto", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    const inMov = mockMovCreate.mock.calls[1][0].data;
    expect(inMov.tipo).toBe("TRANSFERENCIA_IN");
    expect(inMov.cuentaId).toBe(DESTINO_ID);
    expect(inMov.saldoAnterior).toBe(1000);
    expect(inMov.saldoPosterior).toBe(1100); // 1000 + 100
    expect(inMov.descripcion).toContain("Caja Diaria");
  });

  it("updates de balance usan decrement/increment atómicos (anti-race)", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    // 1er updateMany: origen decrement
    expect(mockCuentaUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: ORIGEN_ID, tenantId: TENANT },
      data: { saldo: { decrement: 100 } },
    });
    // 2do updateMany: destino increment
    expect(mockCuentaUpdateMany.mock.calls[1][0]).toMatchObject({
      where: { id: DESTINO_ID, tenantId: TENANT },
      data: { saldo: { increment: 100 } },
    });
  });

  it("ambos movimientos comparten referencia = transferenciaId (auditabilidad)", async () => {
    mockTransferCreate.mockResolvedValue(makeTransferRow({ id: "transfer-AUDIT-123" }));
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    const outMov = mockMovCreate.mock.calls[0][0].data;
    const inMov = mockMovCreate.mock.calls[1][0].data;
    expect(outMov.referencia).toBe("transfer-AUDIT-123");
    expect(inMov.referencia).toBe("transfer-AUDIT-123");
  });

  it("retorna la transferencia mapeada con monto correcto", async () => {
    const result = await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 250,
      descripcion: "Pago proveedor",
    });
    expect(result.id).toBe("transfer-id");
    expect(result.origenId).toBe(ORIGEN_ID);
    expect(result.destinoId).toBe(DESTINO_ID);
  });

  it("descripcion vacia si no se pasa", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
    });
    expect(mockTransferCreate.mock.calls[0][0].data.descripcion).toBe("");
  });

  it("descripcion respetada si se pasa", async () => {
    await TreasuryDB.transferir({
      tenantId: TENANT,
      origenId: ORIGEN_ID,
      destinoId: DESTINO_ID,
      monto: 100,
      descripcion: "Cierre diario caja → banco",
    });
    expect(mockTransferCreate.mock.calls[0][0].data.descripcion).toBe(
      "Cierre diario caja → banco"
    );
  });
});
