/**
 * Devoluciones a proveedor — no se devuelve más de lo que entró (auditoría
 * Compras C49, 17-10). El tope lo pone el SERVIDOR: lo que entró de ese
 * proveedor (movimientos `compra` de sus órdenes) menos lo que ya se le devolvió
 * (sin contar las anuladas); con orden de origen, además, lo que llegó en ella.
 * Un producto que nunca entró de él pide un motivo escrito.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockProductos, mockCreate, mockOrdenes, mockMovs, mockDevueltos } = vi.hoisted(() => ({
  mockProductos: vi.fn(),
  mockCreate: vi.fn(),
  mockOrdenes: vi.fn(),
  mockMovs: vi.fn(),
  mockDevueltos: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: mockProductos },
    supplierReturn: { create: mockCreate },
    purchaseOrder: { findMany: mockOrdenes },
    inventoryMovement: { findMany: mockMovs },
    supplierReturnItem: { findMany: mockDevueltos },
  },
}));

import {
  SupplierReturnsDB, ExcedeLoRecibidoError, OrigenInvalidoError, SinOrigenError,
} from "@/lib/db/supplier-returns.db";

const BASE = { proveedorId: "prov-1", proveedorNombre: "Distribuidora QA", motivo: "Vencido" };
const arroz = (cantidad: number) => ({ nombre: "Arroz 5kg", cantidad, unidad: "und", productId: 7 });

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockImplementation(async (args: unknown) => args);
  mockProductos.mockResolvedValue([{ id: 7, costPrice: "18" }, { id: 8, costPrice: "3" }]);
  // Dos órdenes: en la primera entraron 6 (OC-), en la segunda 4 (ingreso directo, referencia = id).
  mockOrdenes.mockResolvedValue([
    { id: "oc-a", createdAt: new Date("2026-10-01"), receivedDate: null, items: [{ productId: 7, name: "Arroz 5kg", unit: "und", unitCost: "17.50" }] },
    { id: "oc-b", createdAt: new Date("2026-10-05"), receivedDate: new Date("2026-10-06"), items: [{ productId: 7, name: "Arroz 5kg", unit: "und", unitCost: "18.20" }] },
  ]);
  mockMovs.mockResolvedValue([
    { productId: 7, quantity: 6, reference: "OC-oc-a", createdAt: new Date("2026-10-02") },
    { productId: 7, quantity: 4, reference: "oc-b", createdAt: new Date("2026-10-06") },
  ]);
  mockDevueltos.mockResolvedValue([]);
});

describe("tope de lo recibido (C49)", () => {
  it("devolver más de lo que entró se rechaza y no crea nada", async () => {
    const intento = SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(11)] });
    await expect(intento).rejects.toBeInstanceOf(ExcedeLoRecibidoError);
    await intento.catch((e: ExcedeLoRecibidoError) => expect(e.detalle[0]).toMatch(/pides 11 y puedes devolver hasta 10/));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("exactamente lo recibido pasa", async () => {
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(10)] });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("lo ya devuelto se resta del tope", async () => {
    mockDevueltos.mockResolvedValue([{ productId: 7, cantidad: 7 }]);
    await expect(SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(4)] })).rejects.toBeInstanceOf(ExcedeLoRecibidoError);
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(3)] });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("las devoluciones anuladas no cuentan como devueltas", async () => {
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(1)] });
    const filtro = mockDevueltos.mock.calls[0][0].where.supplierReturn;
    expect(filtro).toEqual({ tenantId: "t1", proveedorId: "prov-1", estado: { not: "ANULADA" } });
  });

  it("el mismo producto en dos renglones se suma antes de comparar", async () => {
    await expect(
      SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(6), arroz(5)] }),
    ).rejects.toBeInstanceOf(ExcedeLoRecibidoError);
  });

  it("con orden de origen el tope es lo que llegó en esa orden", async () => {
    await expect(
      SupplierReturnsDB.createWithItems("t1", { ...BASE, origenOrdenId: "oc-b", items: [arroz(5)] }),
    ).rejects.toBeInstanceOf(ExcedeLoRecibidoError);
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, origenOrdenId: "oc-b", items: [arroz(4)] });
    expect(mockCreate.mock.calls[0][0].data.items.create[0].precioUnitario).toBe(18.2);
  });

  it("una orden que no es de ese proveedor (o no recibió nada) se rechaza", async () => {
    await expect(
      SupplierReturnsDB.createWithItems("t1", { ...BASE, origenOrdenId: "oc-de-otro", items: [arroz(1)] }),
    ).rejects.toBeInstanceOf(OrigenInvalidoError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sólo cuenta lo que entró por compra: las órdenes se buscan del proveedor y del negocio", async () => {
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [arroz(1)] });
    expect(mockOrdenes.mock.calls[0][0].where).toEqual({ tenantId: "t1", supplierId: "prov-1" });
    expect(mockMovs.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", type: "compra", productId: { in: [7] } });
  });
});

describe("producto sin recepción de ese proveedor", () => {
  const leche = { nombre: "Leche", cantidad: 2, unidad: "und", productId: 8 };

  it("sin motivo se rechaza", async () => {
    const intento = SupplierReturnsDB.createWithItems("t1", { ...BASE, items: [leche] });
    await expect(intento).rejects.toBeInstanceOf(SinOrigenError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("con motivo se registra y el motivo queda en las notas", async () => {
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, notas: "Llamar a Juan", sinOrigenMotivo: "Compra anterior al sistema", items: [leche] });
    const notas: string = mockCreate.mock.calls[0][0].data.notas;
    expect(notas.split("\n")).toEqual(["Llamar a Juan", "Sin recepción en el sistema (Leche): Compra anterior al sistema"]);
  });

  it("sin proveedor elegido también pide motivo", async () => {
    const { proveedorId: _sinProveedor, ...sinProveedor } = BASE;
    await expect(SupplierReturnsDB.createWithItems("t1", { ...sinProveedor, items: [leche] })).rejects.toBeInstanceOf(SinOrigenError);
    expect(mockOrdenes).not.toHaveBeenCalled();
  });
});
