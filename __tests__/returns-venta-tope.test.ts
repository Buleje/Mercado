// @vitest-environment node
/**
 * POST /api/returns con `saleId` = la otra puerta de devolver una venta del POS.
 *
 * Caso (17-10): la venta de QA `bc19cbe5` (main) cobró S/ 0,10 (S/ 24,80 de trueque)
 * y tiene un `Return` de S/ 24,90. `/api/sales/devolucion` ya topa desde 09-10, pero
 * `/api/returns` seguía devolviendo `SaleItem.price × cantidad` sin mirar el descuento
 * de cabecera, sin sumar lo ya devuelto (la misma unidad N veces), con el crédito al
 * teléfono que manda el cuerpo y sin el freno «efectivo sólo admin/dueño».
 * Ahora la rama de venta pasa por `DevolucionesPosDB.registrar` (candado + tope).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    sale: { findFirst: vi.fn() },
    return: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    product: { findMany: vi.fn(), update: vi.fn() },
    inventoryMovement: { createMany: vi.fn() },
    customer: { updateMany: vi.fn() },
  };
  const viejo = {
    ReturnsDB: { getAll: vi.fn(), add: vi.fn() },
    InventoryMovementsDB: { record: vi.fn() },
    CustomersDB: { updateCreditBalance: vi.fn() },
    SalesDB: { getById: vi.fn() },
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
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: h.viejo.SalesDB }));
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

/** La venta de QA `bc19cbe5` (main, 09-10): S/ 24,90 de lista, S/ 24,80 de trueque, cobró S/ 0,10. */
const VENTA_TRUEQUE = {
  id: "bc19cbe5-772c-4d83-b1f3-1bf301db6210",
  total: "0.10",
  customerPhone: "987000111",
  items: [{ productId: 1252382, name: "Arroz Costeño Extra 5kg", price: "24.90", quantity: 1 }],
};

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/returns", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.rol.value = "admin";
  h.tx.sale.findFirst.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
    Promise.resolve(where.tenantId === "tenant-a" && where.id === VENTA_TRUEQUE.id ? VENTA_TRUEQUE : null),
  );
  h.tx.return.findFirst.mockResolvedValue(null);
  h.tx.return.findMany.mockResolvedValue([]);
  h.tx.return.create.mockResolvedValue({});
  h.tx.product.findMany.mockResolvedValue([{ id: 1252382, stock: 4 }]);
  h.tx.product.update.mockResolvedValue({ stock: 5 });
  h.tx.inventoryMovement.createMany.mockResolvedValue({ count: 1 });
  h.tx.customer.updateMany.mockResolvedValue({ count: 1 });
  // Lo que la ruta vieja leía por su cuenta (sin tope): si se vuelve a usar, el test lo ve.
  h.viejo.SalesDB.getById.mockResolvedValue({
    ...VENTA_TRUEQUE,
    total: 0.1,
    items: VENTA_TRUEQUE.items.map((i) => ({ ...i, price: 24.9, unit: "unidad" })),
  });
  h.viejo.ReturnsDB.add.mockImplementation((r: { items: { price: number; quantity: number }[] }) =>
    Promise.resolve({ id: "ret-1", ...r, total: r.items.reduce((s, i) => s + i.price * i.quantity, 0) }),
  );
  h.viejo.CustomersDB.updateCreditBalance.mockResolvedValue(24.9);
  h.viejo.InventoryMovementsDB.record.mockResolvedValue({});
});

describe("POST /api/returns con saleId — el mismo tope que el POS", () => {
  it("venta con trueque (cobró S/ 0,10): devuelve S/ 0,10, no S/ 24,90", async () => {
    const res = await POST(post({
      saleId: VENTA_TRUEQUE.id,
      items: [{ productId: 1252382, quantity: 1 }],
      applyCredit: true,
      customerPhone: VENTA_TRUEQUE.customerPhone,
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).total).toBe(0.1);
    expect(h.tx.return.create.mock.calls[0][0].data.total).toBe(0.1);
    expect(h.viejo.ReturnsDB.add).not.toHaveBeenCalled();
  });

  it("la misma unidad no se devuelve dos veces: la 2.ª es 400 y no crea nada", async () => {
    h.tx.return.findMany.mockResolvedValue([{ total: "0.10", items: [{ productId: 1252382, quantity: 1 }] }]);
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, quantity: 1 }], applyCredit: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/excede disponible \(0\)/);
    expect(h.tx.return.create).not.toHaveBeenCalled();
    expect(h.viejo.ReturnsDB.add).not.toHaveBeenCalled();
    expect(h.viejo.InventoryMovementsDB.record).not.toHaveBeenCalled();
  });

  it("el crédito va al cliente de la venta, no al teléfono que manda el cuerpo", async () => {
    await POST(post({
      saleId: VENTA_TRUEQUE.id,
      items: [{ productId: 1252382, quantity: 1 }],
      applyCredit: true,
      customerPhone: "999888777",
    }));
    expect(h.viejo.CustomersDB.updateCreditBalance).not.toHaveBeenCalled();
    expect(h.tx.customer.updateMany).toHaveBeenCalledWith({
      where: { phone: VENTA_TRUEQUE.customerPhone, tenantId: "tenant-a" },
      data: { creditBalance: { increment: 0.1 } },
    });
  });

  it("lo ya devuelto se lee DENTRO de la transacción, después del candado de la venta", async () => {
    await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, quantity: 1 }], applyCredit: true }));
    expect(h.tx.$executeRaw).toHaveBeenCalled();
    expect(h.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(h.tx.return.findMany.mock.invocationCallOrder[0]);
  });

  it("cajero sin crédito (= efectivo): 403 antes de tocar la base, como en el POS", async () => {
    h.rol.value = "cajero";
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, quantity: 1 }] }));
    expect(res.status).toBe(403);
    expect(h.tx.sale.findFirst).not.toHaveBeenCalled();
    expect(h.viejo.ReturnsDB.add).not.toHaveBeenCalled();
  });

  it("cuerpo sin items válidos: 400 (safeParse), sin tocar la base", async () => {
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: "x", quantity: -1 }] }));
    expect(res.status).toBe(400);
    expect(h.tx.sale.findFirst).not.toHaveBeenCalled();
  });

  it("venta de otro tenant: 404", async () => {
    const res = await POST(post({ saleId: "venta-ajena", items: [{ productId: 1252382, quantity: 1 }], applyCredit: true }));
    expect(res.status).toBe(404);
  });
});

// La rama con `orderId` tiene su propio test: `__tests__/returns-pedido-tope.test.ts`.
