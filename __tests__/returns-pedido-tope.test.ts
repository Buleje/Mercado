// @vitest-environment node
/**
 * POST /api/returns con `orderId` (17-10): los mismos huecos que se cerraron para la venta.
 *
 * Antes la rama del pedido devolvía `OrderItem.price × cantidad` sin restar el cupón ni la
 * promoción (`Order.total` es lo cobrado), no sumaba lo ya devuelto (la misma unidad N veces),
 * acreditaba al teléfono que mandaba el cuerpo (`CustomersDB.updateCreditBalance`), escribía
 * sin transacción ni candado y dejaba devolver en efectivo a cualquier rol.
 * Ahora pasa por `DevolucionesPedidoDB.registrar` (candado + tope por unidades y por monto).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    order: { findFirst: vi.fn() },
    return: { findMany: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn(), update: vi.fn() },
    inventoryMovement: { createMany: vi.fn() },
    customer: { updateMany: vi.fn() },
  };
  const viejo = {
    ReturnsDB: { getAll: vi.fn(), add: vi.fn() },
    InventoryMovementsDB: { record: vi.fn() },
    CustomersDB: { updateCreditBalance: vi.fn() },
    OrdersDB: { getById: vi.fn() },
  };
  return { tx, viejo, rol: { value: "admin" as string } };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ...h.tx, $transaction: vi.fn((fn: (t: typeof h.tx) => unknown) => fn(h.tx)) },
}));
vi.mock("@/lib/jsondb", () => ({
  ReturnsDB: h.viejo.ReturnsDB,
  InventoryMovementsDB: h.viejo.InventoryMovementsDB,
  CustomersDB: h.viejo.CustomersDB,
}));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: h.viejo.OrdersDB }));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: (fn: () => unknown) => fn() }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_req: unknown, _u: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: h.rol.value, username: "qa", tenantId: "tenant-a" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST } from "@/app/api/returns/route";

/** Pedido de 4 leches a S/ 5 con cupón de S/ 2: lista S/ 20, cobró S/ 18. */
const PEDIDO_CUPON = {
  id: "ord-cupon",
  total: "18.00",
  status: "entregado",
  customerPhone: "987000111",
  items: [{ productId: 7, name: "Leche Gloria 400g", price: "5.00", quantity: 4, unit: "unidad" }],
};

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/returns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const devolverLeche = (qty: number, extra: Record<string, unknown> = {}) =>
  POST(post({ orderId: PEDIDO_CUPON.id, items: [{ productId: 7, quantity: qty }], applyCredit: true, ...extra }));

let pedido: Record<string, unknown> = PEDIDO_CUPON;

beforeEach(() => {
  vi.clearAllMocks();
  h.rol.value = "admin";
  pedido = PEDIDO_CUPON;
  h.tx.order.findFirst.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
    Promise.resolve(where.tenantId === "tenant-a" && where.id === pedido.id ? pedido : null),
  );
  h.tx.return.findMany.mockResolvedValue([]);
  h.tx.return.create.mockResolvedValue({ id: "ret-1" });
  h.tx.product.findMany.mockResolvedValue([{ id: 7, stock: 10 }]);
  h.tx.product.update.mockResolvedValue({ stock: 12 });
  h.tx.inventoryMovement.createMany.mockResolvedValue({ count: 1 });
  h.tx.customer.updateMany.mockResolvedValue({ count: 1 });
  // Lo que la ruta vieja leía por su cuenta (sin tope): si se vuelve a usar, el test lo ve.
  h.viejo.OrdersDB.getById.mockResolvedValue({
    id: PEDIDO_CUPON.id,
    items: [{ id: 7, name: "Leche Gloria 400g", price: 5, quantity: 4, unit: "unidad" }],
  });
  h.viejo.ReturnsDB.add.mockImplementation((r: { items: { price: number; quantity: number }[] }) =>
    Promise.resolve({ id: "ret-viejo", ...r, total: r.items.reduce((s, i) => s + i.price * i.quantity, 0) }),
  );
  h.viejo.CustomersDB.updateCreditBalance.mockResolvedValue(10);
  h.viejo.InventoryMovementsDB.record.mockResolvedValue({});
});

describe("POST /api/returns con orderId — el mismo tope que la venta", () => {
  it("pedido con cupón (cobró S/ 18 de S/ 20): 2 de 4 leches devuelven S/ 9, no S/ 10", async () => {
    const res = await devolverLeche(2);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.total).toBe(9);
    expect(body.brutoSinDescuento).toBe(10);
    expect(h.tx.return.create.mock.calls[0][0].data.total).toBe(9);
    expect(h.viejo.ReturnsDB.add).not.toHaveBeenCalled();
  });

  it("la misma unidad no se devuelve dos veces: con las 4 ya devueltas, la 5.ª es 400 y no crea nada", async () => {
    h.tx.return.findMany.mockResolvedValue([{ total: "18.00", items: [{ productId: 7, quantity: 4 }] }]);
    const res = await devolverLeche(1);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("excede_cantidad");
    expect(h.tx.return.create).not.toHaveBeenCalled();
    expect(h.tx.product.update).not.toHaveBeenCalled();
    expect(h.viejo.InventoryMovementsDB.record).not.toHaveBeenCalled();
  });

  it("el monto ya devuelto también topa: con S/ 15 devueltos, 2 leches devuelven S/ 3 (lo que queda)", async () => {
    // Una devolución vieja a precio de lista dejó S/ 15 devueltos por 1 unidad.
    h.tx.return.findMany.mockResolvedValue([{ total: "15.00", items: [{ productId: 7, quantity: 1 }] }]);
    const res = await devolverLeche(2);
    expect(res.status).toBe(201);
    expect((await res.json()).total).toBe(3);
  });

  it("el saldo a favor va al cliente DEL PEDIDO, no al teléfono que manda el cuerpo", async () => {
    await devolverLeche(2, { customerPhone: "999888777" });
    expect(h.viejo.CustomersDB.updateCreditBalance).not.toHaveBeenCalled();
    expect(h.tx.customer.updateMany).toHaveBeenCalledWith({
      where: { phone: PEDIDO_CUPON.customerPhone, tenantId: "tenant-a" },
      data: { creditBalance: { increment: 9 } },
    });
    expect(h.tx.return.create.mock.calls[0][0].data.customerPhone).toBe(PEDIDO_CUPON.customerPhone);
  });

  it("lo ya devuelto se lee DENTRO de la transacción, después del candado del pedido", async () => {
    await devolverLeche(1);
    expect(h.tx.$executeRaw).toHaveBeenCalled();
    expect(h.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(h.tx.return.findMany.mock.invocationCallOrder[0]);
  });

  it("cajero sin crédito (= efectivo): 403 antes de tocar la base, como en el POS", async () => {
    h.rol.value = "cajero";
    const res = await POST(post({ orderId: PEDIDO_CUPON.id, items: [{ productId: 7, quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(h.tx.order.findFirst).not.toHaveBeenCalled();
    expect(h.viejo.ReturnsDB.add).not.toHaveBeenCalled();
  });

  it("dueño en efectivo: 201 sin tocar el saldo del cliente", async () => {
    h.rol.value = "owner";
    const res = await POST(post({ orderId: PEDIDO_CUPON.id, items: [{ productId: 7, quantity: 1 }] }));
    expect(res.status).toBe(201);
    expect((await res.json()).creditApplied).toBe(false);
    expect(h.tx.customer.updateMany).not.toHaveBeenCalled();
  });

  it("media unidad: 400 (las líneas del pedido son enteras)", async () => {
    const res = await devolverLeche(0.5);
    expect(res.status).toBe(400);
    expect(h.tx.order.findFirst).not.toHaveBeenCalled();
  });

  it("pedido de otro tenant: 404", async () => {
    const res = await POST(post({ orderId: "ord-ajeno", items: [{ productId: 7, quantity: 1 }], applyCredit: true }));
    expect(res.status).toBe(404);
    expect(h.tx.return.create).not.toHaveBeenCalled();
  });

  it("pedido anulado: 409, no devuelve nada", async () => {
    pedido = { ...PEDIDO_CUPON, status: "cancelado" };
    const res = await devolverLeche(1);
    expect(res.status).toBe(409);
    expect(h.tx.return.create).not.toHaveBeenCalled();
  });

  it("crédito en un pedido sin cliente: 400 (no hay a quién dejarle el saldo)", async () => {
    pedido = { ...PEDIDO_CUPON, customerPhone: null };
    const res = await devolverLeche(1);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("pedido_sin_cliente");
  });

  it("cliente que no está en este negocio: 409 (la transacción se deshace)", async () => {
    h.tx.customer.updateMany.mockResolvedValue({ count: 0 });
    const res = await devolverLeche(1);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("cliente_no_registrado");
  });

  it("producto sin control de stock (null = ilimitado): no se le suma stock", async () => {
    h.tx.product.findMany.mockResolvedValue([{ id: 7, stock: null }]);
    const res = await devolverLeche(1);
    expect(res.status).toBe(201);
    expect(h.tx.product.update).not.toHaveBeenCalled();
    expect(h.tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });
});
