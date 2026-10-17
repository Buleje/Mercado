/**
 * Devoluciones a proveedor — el costo de cada ítem lo pone el servidor (10-10).
 *
 * Antes `createWithItems` guardaba el `precioUnitario` que mandaba el navegador
 * sin mirarlo (regla 6: totales en el backend). Ahora, si el ítem trae
 * `productId`, el precio sale del `costPrice` del producto DEL MISMO negocio, y
 * un `productId` ajeno se rechaza: con él, «Marcar enviada» movería stock de
 * otro negocio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindMany, mockCreate } = vi.hoisted(() => ({ mockFindMany: vi.fn(), mockCreate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { product: { findMany: mockFindMany }, supplierReturn: { create: mockCreate } },
}));

import { SupplierReturnsDB, ProductoAjenoError } from "@/lib/db/supplier-returns.db";

const BASE = { proveedorNombre: "Proveedor QA", motivo: "Vencido" };

describe("SupplierReturnsDB.createWithItems — precio del servidor", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCreate.mockReset();
    mockCreate.mockImplementation(async (args: unknown) => args);
  });

  it("usa el costPrice del producto, no el que manda el navegador", async () => {
    mockFindMany.mockResolvedValue([{ id: 7, costPrice: "4.50" }]);
    await SupplierReturnsDB.createWithItems("t1", {
      ...BASE,
      items: [{ nombre: "Atún", cantidad: 2, unidad: "und", productId: 7, precioUnitario: 0.01 }],
    });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", id: { in: [7] } } }));
    const datos = mockCreate.mock.calls[0][0].data;
    expect(datos.items.create[0].precioUnitario).toBe(4.5);
    expect(datos.tenantId).toBe("t1");
  });

  it("un ítem escrito a mano (sin productId) conserva su precio", async () => {
    await SupplierReturnsDB.createWithItems("t1", {
      ...BASE,
      items: [{ nombre: "Envase", cantidad: 1, unidad: "und", precioUnitario: 3 }],
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockCreate.mock.calls[0][0].data.items.create[0].precioUnitario).toBe(3);
  });

  it("rechaza un productId de otro negocio sin crear nada", async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(
      SupplierReturnsDB.createWithItems("t1", {
        ...BASE,
        items: [{ nombre: "Ajeno", cantidad: 1, unidad: "und", productId: 99 }],
      }),
    ).rejects.toBeInstanceOf(ProductoAjenoError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
