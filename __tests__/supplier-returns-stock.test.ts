/**
 * ADR-379 — la devolución al proveedor saca la mercadería del stock.
 *
 * El test que importa acá es el de la IDEMPOTENCIA. Este repo ya se comió dos
 * veces el mismo bug —en ventas y en ajustes de inventario— y la segunda vez
 * una venta de 3 restaba 6. La API acepta cualquier estado válido, así que
 * ENVIADA → RESUELTA → ENVIADA descontaría de nuevo si el guard fuera sólo la
 * transición: la marca `stockAplicadoAt` en la fila es lo que lo vuelve
 * imposible, y esto lo fija.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockFindFirst, mockUpdate, mockProductFindFirst, mockProductUpdate, mockMovementCreate, mockTransaction } =
  vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockUpdate: vi.fn(),
    mockProductFindFirst: vi.fn(),
    mockProductUpdate: vi.fn(),
    mockMovementCreate: vi.fn(),
    mockTransaction: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    supplierReturn: { findFirst: mockFindFirst, update: mockUpdate },
    product: { findFirst: mockProductFindFirst, update: mockProductUpdate },
    inventoryMovement: { create: mockMovementCreate },
  },
}));

import { updateSupplierReturnEstado } from "@/lib/db/supplier-returns-by-id.db";

const TENANT = "cmpxiv6p4000bohvzwl6bnfpv";

/** Devolución de 4 unidades de un producto con 10 en stock. */
function devolucion(over: Record<string, unknown> = {}) {
  return {
    id: "ret-1",
    tenantId: TENANT,
    proveedorNombre: "Distribuidora del Sur",
    motivo: "Producto vencido",
    estado: "PENDIENTE",
    stockAplicadoAt: null,
    items: [{ id: 1, nombre: "Arroz 5kg", cantidad: 4, unidad: "und", productId: 77, precioUnitario: 18 }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // El transaction client expone los mismos mocks que el prisma de arriba.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      supplierReturn: { findFirst: mockFindFirst, update: mockUpdate },
      product: { findFirst: mockProductFindFirst, update: mockProductUpdate },
      inventoryMovement: { create: mockMovementCreate },
    }),
  );
  mockProductFindFirst.mockResolvedValue({ id: 77, name: "Arroz 5kg", stock: 10 });
  mockUpdate.mockResolvedValue({});
});

describe("marcar ENVIADA saca la mercadería del stock", () => {
  it("descuenta lo devuelto y deja el movimiento en el kardex", async () => {
    mockFindFirst
      .mockResolvedValueOnce(devolucion())
      .mockResolvedValueOnce(devolucion({ estado: "ENVIADA", stockAplicadoAt: new Date() }));

    const res = await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77 }, data: { stock: 6 } }),
    );
    expect(res?.avisos).toEqual([]);
  });

  it("el movimiento es de tipo devolucion_proveedor, NO devolucion", async () => {
    // `devolucion` es la del cliente y el kardex la lee como ENTRADA: usarla
    // acá haría que el libro sume una mercadería que salió.
    mockFindFirst
      .mockResolvedValueOnce(devolucion())
      .mockResolvedValueOnce(devolucion({ estado: "ENVIADA" }));

    await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "devolucion_proveedor",
          quantity: 4,
          previousStock: 10,
          newStock: 6,
          reference: "ret-1",
        }),
      }),
    );
  });

  it("marca el momento del descuento para no repetirlo", async () => {
    mockFindFirst
      .mockResolvedValueOnce(devolucion())
      .mockResolvedValueOnce(devolucion({ estado: "ENVIADA" }));

    await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stockAplicadoAt: expect.any(Date) }),
      }),
    );
  });
});

describe("el stock sale UNA sola vez", () => {
  it("volver a ENVIADA sobre una devolución ya descontada no toca el stock", async () => {
    // El caso real: ENVIADA → RESUELTA → ENVIADA por API.
    const yaDescontada = devolucion({ estado: "RESUELTA", stockAplicadoAt: new Date("2026-08-01") });
    mockFindFirst.mockResolvedValueOnce(yaDescontada).mockResolvedValueOnce(yaDescontada);

    await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockProductUpdate).not.toHaveBeenCalled();
    expect(mockMovementCreate).not.toHaveBeenCalled();
  });

  it("pasar a RESUELTA tampoco vuelve a descontar", async () => {
    const enviada = devolucion({ estado: "ENVIADA", stockAplicadoAt: new Date() });
    mockFindFirst.mockResolvedValueOnce(enviada).mockResolvedValueOnce(enviada);

    await updateSupplierReturnEstado(TENANT, "ret-1", "RESUELTA");

    expect(mockProductUpdate).not.toHaveBeenCalled();
  });
});

describe("lo que no se puede descontar se avisa, no se silencia", () => {
  it("un ítem escrito a mano no mueve stock y lo dice", async () => {
    const aMano = devolucion({
      items: [{ id: 1, nombre: "Envase retornable", cantidad: 2, unidad: "und", productId: null, precioUnitario: null }],
    });
    mockFindFirst.mockResolvedValueOnce(aMano).mockResolvedValueOnce(aMano);

    const res = await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockProductUpdate).not.toHaveBeenCalled();
    expect(res?.avisos[0]).toContain("Envase retornable");
  });

  it("un producto sin control de stock no se toca", async () => {
    mockProductFindFirst.mockResolvedValue({ id: 77, name: "Aserrado de madera", stock: null });
    mockFindFirst.mockResolvedValueOnce(devolucion()).mockResolvedValueOnce(devolucion());

    const res = await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    expect(mockProductUpdate).not.toHaveBeenCalled();
    expect(res?.avisos[0]).toContain("no lleva control de stock");
  });

  it("avisa cuando el stock queda negativo en vez de esconderlo", async () => {
    mockProductFindFirst.mockResolvedValue({ id: 77, name: "Arroz 5kg", stock: 1 });
    mockFindFirst.mockResolvedValueOnce(devolucion()).mockResolvedValueOnce(devolucion());

    const res = await updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA");

    // Se registra igual: el kardex tiene que decir la verdad.
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: -3 } }),
    );
    expect(res?.avisos.join(" ")).toContain("-3");
  });
});
