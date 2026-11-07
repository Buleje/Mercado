/**
 * Devoluciones a proveedor — el costo de cada ítem lo pone el servidor (10-10).
 *
 * Antes `createWithItems` guardaba el `precioUnitario` que mandaba el navegador
 * sin mirarlo (regla 6: totales en el backend). Ahora, si el ítem trae
 * `productId`, el precio sale del servidor y un `productId` ajeno se rechaza:
 * con él, «Marcar enviada» movería stock de otro negocio.
 *
 * 17-10 (C51): el orden es orden de origen → última compra a ESE proveedor →
 * `costPrice` de la ficha → `null` («pendiente de valoración», nunca S/ 0).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockFindMany, mockCreate, mockOrdenes, mockMovs, mockDevueltos, mockCandado } = vi.hoisted(() => ({
  mockCandado: vi.fn(),
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockOrdenes: vi.fn(),
  mockMovs: vi.fn(),
  mockDevueltos: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const db: Record<string, unknown> = {
    product: { findMany: mockFindMany },
    supplierReturn: { create: mockCreate },
    purchaseOrder: { findMany: mockOrdenes },
    inventoryMovement: { findMany: mockMovs },
    supplierReturnItem: { findMany: mockDevueltos },
    $executeRaw: mockCandado,
  };
  // El tope + el alta corren en una transacción (revisión 17-10): el doble la ejecuta sobre sí mismo.
  db.$transaction = (fn: (tx: unknown) => unknown) => fn(db);
  return { prisma: db };
});

import { SupplierReturnsDB, ProductoAjenoError } from "@/lib/db/supplier-returns.db";

const BASE = { proveedorNombre: "Proveedor QA", motivo: "Vencido" };
const ATUN = { nombre: "Atún", cantidad: 2, unidad: "und", productId: 7, precioUnitario: 0.01 };

/** Dos órdenes del proveedor que trajeron atún: la vieja a S/ 4, la nueva a S/ 5. */
function conDosCompras() {
  mockOrdenes.mockResolvedValue([
    { id: "oc-vieja", createdAt: new Date("2026-09-01"), receivedDate: new Date("2026-09-02"), items: [{ productId: 7, name: "Atún", unit: "und", unitCost: "4.00" }] },
    { id: "oc-nueva", createdAt: new Date("2026-10-01"), receivedDate: new Date("2026-10-02"), items: [{ productId: 7, name: "Atún", unit: "und", unitCost: "5.00" }] },
  ]);
  mockMovs.mockResolvedValue([
    { productId: 7, quantity: 10, reference: "OC-oc-vieja", createdAt: new Date("2026-09-02") },
    { productId: 7, quantity: 10, reference: "OC-oc-nueva", createdAt: new Date("2026-10-02") },
  ]);
}

const precioGuardado = () => mockCreate.mock.calls[0][0].data.items.create[0].precioUnitario;

describe("SupplierReturnsDB.createWithItems — precio del servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockImplementation(async (args: unknown) => args);
    mockFindMany.mockResolvedValue([{ id: 7, costPrice: "4.50" }]);
    mockOrdenes.mockResolvedValue([]);
    mockMovs.mockResolvedValue([]);
    mockDevueltos.mockResolvedValue([]);
  });

  it("sin compras de ese proveedor usa el costPrice de la ficha, no el del navegador", async () => {
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, sinOrigenMotivo: "Vino antes del sistema", items: [ATUN] });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", id: { in: [7] } } }));
    expect(precioGuardado()).toBe(4.5);
    expect(mockCreate.mock.calls[0][0].data.tenantId).toBe("t1");
  });

  it("con orden de origen usa el costo de ESA orden", async () => {
    conDosCompras();
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, proveedorId: "prov-1", origenOrdenId: "oc-vieja", items: [ATUN] });
    expect(precioGuardado()).toBe(4);
    expect(mockCreate.mock.calls[0][0].data.notas).toMatch(/^Origen: orden .+ recibida el /);
  });

  it("sin orden elegida usa la última compra a ese proveedor antes que la ficha", async () => {
    conDosCompras();
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, proveedorId: "prov-1", items: [ATUN] });
    expect(precioGuardado()).toBe(5);
  });

  it("sin compra ni costo en la ficha queda pendiente de valoración (null, no 0)", async () => {
    mockFindMany.mockResolvedValue([{ id: 7, costPrice: null }]);
    await SupplierReturnsDB.createWithItems("t1", { ...BASE, sinOrigenMotivo: "Lo trajo el vendedor", items: [ATUN] });
    expect(precioGuardado()).toBeNull();
  });

  it("un ítem escrito a mano (sin productId) conserva su precio", async () => {
    await SupplierReturnsDB.createWithItems("t1", {
      ...BASE,
      items: [{ nombre: "Envase", cantidad: 1, unidad: "und", precioUnitario: 3 }],
    });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(precioGuardado()).toBe(3);
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
