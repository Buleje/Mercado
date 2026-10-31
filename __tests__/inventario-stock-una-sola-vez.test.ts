import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Blinda el doble descuento de stock medido el 2026-08-11.
 *
 * `InventoryMovementsDB.record` no sólo anota: **mueve el stock**. Dos
 * llamadores que ya lo habían escrito lo invocaban "para el audit trail", y el
 * movimiento se aplicaba dos veces:
 *
 *   - vender 3 unidades descontaba 6   (`app/api/sales`)
 *   - ajustar de 100 a 80 dejaba 60    (`PUT /api/products/[id]`)
 *
 * `stockYaAplicado: true` deja la constancia sin volver a tocar el producto.
 */

const mockPrisma = {
  product: { findFirst: vi.fn(), updateMany: vi.fn() },
  inventoryMovement: { create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/push-sender", () => ({ broadcastPush: vi.fn() }));

const { InventoryMovementsDB } = await import("@/lib/db/inventory.db");

const TENANT = "main";

function movimientoCreado() {
  return mockPrisma.inventoryMovement.create.mock.calls[0]?.[0]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.inventoryMovement.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 1, createdAt: new Date(), lossType: null, reference: null, notes: null,
    warehouseId: null, createdBy: null, ...data,
  }));
  mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
});

describe("record con stockYaAplicado — el llamador ya escribió el stock", () => {
  it("una venta NO vuelve a descontar (bug: vender 3 restaba 6)", async () => {
    // La transacción de la venta ya dejó el stock en 47.
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 47, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "venta", quantity: 3, tenantId: TENANT, stockYaAplicado: true,
    });

    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("el kardex igual dice de dónde vino y a dónde fue", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 47, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "venta", quantity: 3, tenantId: TENANT, stockYaAplicado: true,
    });

    expect(movimientoCreado()).toMatchObject({ previousStock: 50, newStock: 47, quantity: 3 });
  });

  it("un ajuste hacia abajo reconstruye bien el punto de partida", async () => {
    // El PUT ya dejó el stock en 80; venía de 100.
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 80, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "ajuste_negativo", quantity: 20, tenantId: TENANT, stockYaAplicado: true,
    });

    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
    expect(movimientoCreado()).toMatchObject({ previousStock: 100, newStock: 80 });
  });

  it("un ingreso ya aplicado reconstruye hacia atrás restando", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 120, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "compra", quantity: 20, tenantId: TENANT, stockYaAplicado: true,
    });

    expect(movimientoCreado()).toMatchObject({ previousStock: 100, newStock: 120 });
  });
});

describe("record sin la bandera — sigue siendo quien mueve el stock", () => {
  it("una devolución sube el stock (nadie lo escribió antes)", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 47, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "devolucion", quantity: 3, tenantId: TENANT,
    });

    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 50 } }),
    );
  });

  it("una merma baja el stock", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 47, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "merma", quantity: 2, tenantId: TENANT,
    });

    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 45 } }),
    );
  });

  it("el stock nunca queda negativo", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 7, stock: 2, stockMin: null, name: "Arroz" });

    await InventoryMovementsDB.record({
      productId: 7, type: "merma", quantity: 5, tenantId: TENANT,
    });

    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 0 } }),
    );
  });
});
