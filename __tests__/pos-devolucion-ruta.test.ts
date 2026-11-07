// @vitest-environment node
/**
 * POST/GET /api/sales/devolucion sobre `DevolucionesPosDB` real con prisma mockeado:
 * lo devuelto sale de lo cobrado (descuento global y trueque prorrateados), nunca
 * pasa de `Sale.total`, el reintento con la misma clave no devuelve dos veces y
 * otro tenant no ve la venta.
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
  return { tx, rol: { value: "admin" as string } };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { ...h.tx, $transaction: vi.fn((fn: (t: typeof h.tx) => unknown) => fn(h.tx)) },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: h.rol.value, username: "qa", tenantId: "tenant-a" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET, POST } from "@/app/api/sales/devolucion/route";
import { idDevolucionPorClave } from "@/lib/db/devoluciones-pos.db";

/** La venta de QA `bc19cbe5` (main, 09-10): S/ 24,90 de lista, S/ 24,80 de trueque, cobró S/ 0,10. */
const VENTA_TRUEQUE = {
  id: "bc19cbe5-772c-4d83-b1f3-1bf301db6210",
  total: "0.10",
  customerPhone: "987000111",
  items: [{ productId: 1252382, name: "Producto QA", price: "24.90", quantity: 1 }],
};

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/sales/devolucion", {
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
});

describe("POST /api/sales/devolucion — la plata", () => {
  it("venta con trueque (cobró S/ 0,10): devuelve S/ 0,10, no S/ 24,90", async () => {
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, qty: 1 }], refundType: "efectivo" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalRefund).toBe(0.1);
    expect(data.brutoSinDescuento).toBe(24.9);
    const creado = h.tx.return.create.mock.calls[0][0].data;
    expect(creado.total).toBe(0.1);
    expect(creado.items.create[0].price).toBe(0.1);
    // El stock vuelve igual: la mercadería entró aunque la plata no.
    expect(h.tx.inventoryMovement.createMany.mock.calls[0][0].data[0]).toMatchObject({ previousStock: 4, newStock: 5, quantity: 1 });
  });

  it("una devolución vieja que ya pagó de más (24,90) deja la nueva en 0", async () => {
    h.tx.sale.findFirst.mockResolvedValue({ ...VENTA_TRUEQUE, items: [{ ...VENTA_TRUEQUE.items[0], quantity: 2 }] });
    h.tx.return.findMany.mockResolvedValue([{ total: "24.90", items: [{ productId: 1252382, quantity: 1 }] }]);
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, qty: 1 }], refundType: "credito" }));
    expect((await res.json()).totalRefund).toBe(0);
    // Crédito de 0: no se toca al cliente.
    expect(h.tx.customer.updateMany).not.toHaveBeenCalled();
  });

  it("el mismo producto dos veces en el pedido se suma: no devuelve 2 de una venta de 1", async () => {
    const res = await POST(post({
      saleId: VENTA_TRUEQUE.id,
      items: [{ productId: 1252382, qty: 1 }, { productId: 1252382, qty: 1 }],
      refundType: "efectivo",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/excede disponible \(1\)/);
    expect(h.tx.return.create).not.toHaveBeenCalled();
  });

  it("un producto que no está en la venta es 400, no una devolución vacía de S/ 0", async () => {
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 999, qty: 1 }], refundType: "efectivo" }));
    expect(res.status).toBe(400);
    expect(h.tx.return.create).not.toHaveBeenCalled();
  });

  it("lo ya devuelto se lee DENTRO de la transacción, después del candado de la venta", async () => {
    await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, qty: 1 }], refundType: "efectivo" }));
    const candado = h.tx.$executeRaw.mock.invocationCallOrder[0];
    expect(candado).toBeLessThan(h.tx.return.findMany.mock.invocationCallOrder[0]);
  });
});

describe("POST /api/sales/devolucion — idempotencia", () => {
  const clave = "8c1f0e7a-4b7e-4f7a-9d55-0d3f6a1b2c3d";
  const cuerpo = { saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, qty: 1 }], refundType: "efectivo", idempotencyKey: clave };

  it("la primera vez crea el Return con el id de la clave", async () => {
    await POST(post(cuerpo));
    expect(h.tx.return.create.mock.calls[0][0].data.id).toBe(idDevolucionPorClave("tenant-a", clave));
  });

  it("el reintento responde lo mismo sin crear otra devolución ni tocar stock", async () => {
    h.tx.return.findFirst.mockResolvedValue({
      saleId: VENTA_TRUEQUE.id, total: "0.10", creditApplied: false,
      items: [{ productId: 1252382, name: "Producto QA", quantity: 1, price: "0.10" }],
    });
    const res = await POST(post(cuerpo));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ totalRefund: 0.1, repetida: true, refundType: "efectivo" });
    expect(h.tx.return.create).not.toHaveBeenCalled();
    expect(h.tx.product.update).not.toHaveBeenCalled();
  });

  it("la misma clave con otro cuerpo es 422", async () => {
    h.tx.return.findFirst.mockResolvedValue({
      saleId: VENTA_TRUEQUE.id, total: "0.10", creditApplied: true,
      items: [{ productId: 1252382, name: "Producto QA", quantity: 1, price: "0.10" }],
    });
    const res = await POST(post(cuerpo));
    expect(res.status).toBe(422);
    expect(h.tx.return.create).not.toHaveBeenCalled();
  });

  it("la clave no choca entre tenants", () => {
    expect(idDevolucionPorClave("tenant-a", clave)).not.toBe(idDevolucionPorClave("tenant-b", clave));
  });
});

describe("/api/sales/devolucion — permisos y tenant", () => {
  it("cajero en efectivo: 403 antes de tocar la base", async () => {
    h.rol.value = "cajero";
    const res = await POST(post({ saleId: VENTA_TRUEQUE.id, items: [{ productId: 1252382, qty: 1 }], refundType: "efectivo" }));
    expect(res.status).toBe(403);
    expect(h.tx.sale.findFirst).not.toHaveBeenCalled();
  });

  it("venta de otro tenant: 404 (el WHERE lleva el tenant de la sesión)", async () => {
    const res = await POST(post({ saleId: "venta-de-otro", items: [{ productId: 1, qty: 1 }], refundType: "efectivo" }));
    expect(res.status).toBe(404);
    expect(h.tx.sale.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a" });
  });

  it("GET devuelve lo ya devuelto y lo que queda de la plata", async () => {
    h.tx.return.findMany.mockResolvedValue([{ total: "0.04", items: [{ productId: 1252382, quantity: 1 }] }]);
    const res = await GET(new NextRequest(`http://localhost/api/sales/devolucion?saleId=${VENTA_TRUEQUE.id}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cobrado: 0.1, yaReembolsado: 0.04, queda: 0.06, yaDevuelto: { 1252382: 1 } });
  });
});
