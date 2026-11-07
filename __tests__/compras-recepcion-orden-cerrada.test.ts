/**
 * Revisión 17-10, puntos 1 y 8: la recepción mira el estado de la orden.
 *
 * Antes, con «Recibir» abierto mientras otra persona marcaba la orden recibida
 * (o la cancelaba), el stock entraba dos veces y una orden cancelada volvía a
 * «parcial». Ahora: 409 si ya estaba cerrada al leerla; y dentro de la
 * transacción la orden se TOMA primero (updateMany con el estado en el WHERE):
 * si la cerraron entre la lectura y la escritura, count 0 y no se guarda nada,
 * ni la recepción. Punto 8: un servicio no suma stock ni deja movimiento.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  ocFindFirst: vi.fn(),
  receiptCreate: vi.fn(),
  transaction: vi.fn(),
  tx: null as null | Record<string, Record<string, ReturnType<typeof vi.fn>>>,
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/db/goods-receipts.db", () => ({ GoodsReceiptsDB: { create: h.receiptCreate, list: vi.fn() } }));
vi.mock("@/lib/db/purchases.db", () => ({
  PurchasesDB: { pertenencia: vi.fn().mockResolvedValue({ existe: true, proveedorAjeno: false, productosAjenos: [] }) },
}));
vi.mock("@/lib/compras/recibido-acumulado", () => ({
  getRecibidoAcumulado: vi.fn().mockResolvedValue(new Map()),
  estaCompleta: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/compras/aplicar-credito-recepcion", () => ({
  SIN_CREDITO: { total: 0, descontado: 0, aFavor: 0, payableId: null, detalle: "" },
  aplicarCreditoRecepcion: vi.fn(),
  anotarCreditoEnItems: vi.fn((items: unknown) => items),
  getFaltantesAcreditados: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { purchaseOrder: { findFirst: h.ocFindFirst }, $transaction: h.transaction },
}));

import { POST } from "@/app/api/compras/recepciones/route";

function nuevoTx() {
  return {
    product: {
      findFirst: vi.fn().mockResolvedValue({ id: 7, name: "Yogurt fresa 1 L", category: "Lácteos", unit: "unidad", stock: 4, costPrice: 5, type: "physical" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
    batch: { createMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    purchaseOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn() },
    goodsReceipt: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

const OC = {
  id: "oc-1", tenantId: "t-a", status: "parcial", supplierId: "sup-1", supplierName: "Gloria", total: 120, flete: 0, otrosCostos: 0, notes: "",
  items: [{ productId: 7, name: "Yogurt fresa 1 L", quantity: 24, unitCost: 5, unit: "unidad" }],
};

const req = () =>
  new NextRequest("http://localhost/api/compras/recepciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderRef: "oc-1", supplier: "Gloria",
      items: [{ product: "Yogurt fresa 1 L", productId: 7, expectedQty: 24, receivedQty: 10, condition: "ok", notes: "" }],
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.tx = nuevoTx();
  h.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.tx));
  h.requireAdmin.mockResolvedValue({ tenantId: "t-a", username: "almacen", role: "almacenero" });
  h.ocFindFirst.mockResolvedValue(OC);
  h.receiptCreate.mockImplementation(async (_t: string, d: Record<string, unknown>) => ({
    id: "rec-1", ref: d.ref, purchaseOrderId: "oc-1", supplierName: "Gloria", scheduledDate: null,
    receivedDate: new Date(), status: "parcial", inspector: null, itemsJson: d.items, photos: 0, nonConformities: 0, invoiceUrl: null,
  }));
});

describe("recepción contra una orden cerrada (punto 1)", () => {
  it("orden ya recibida al abrirla: 409 y no escribe nada", async () => {
    h.ocFindFirst.mockResolvedValue({ ...OC, status: "recibido" });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ya se recibió entera/);
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });

  it("orden cancelada: 409 y le dice que la registre sin orden", async () => {
    h.ocFindFirst.mockResolvedValue({ ...OC, status: "cancelado" });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/recepción sin orden/);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });

  it("la cerraron entre la lectura y la escritura: count 0 al tomarla → 409, sin recepción ni stock", async () => {
    // Dos llamadas: la primera recepción toma la orden y la cierra; la segunda
    // ya la encuentra «recibido» al reevaluar el WHERE.
    h.tx!.purchaseOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    h.tx!.purchaseOrder.findFirst.mockResolvedValueOnce({ status: "recibido" });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ estado: "recibido" });
    expect(h.tx!.purchaseOrder.updateMany.mock.calls[0][0].where).toEqual({ id: "oc-1", tenantId: "t-a", status: { notIn: ["recibido", "cancelado"] } });
    expect(h.receiptCreate).not.toHaveBeenCalled();
    expect(h.tx!.product.updateMany).not.toHaveBeenCalled();
    expect(h.tx!.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("la borraron mientras tanto: 404", async () => {
    h.tx!.purchaseOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    h.tx!.purchaseOrder.findFirst.mockResolvedValueOnce(null);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });

  it("orden abierta: primero la toma, después crea la recepción DENTRO de la tx y el estado final no reabre una cerrada", async () => {
    const res = await POST(req());
    expect(res.status).toBe(201);
    const tomar = h.tx!.purchaseOrder.updateMany.mock.invocationCallOrder[0];
    expect(tomar).toBeLessThan(h.receiptCreate.mock.invocationCallOrder[0]);
    expect(h.receiptCreate.mock.calls[0][2]).toBe(h.tx);
    const final = h.tx!.purchaseOrder.updateMany.mock.calls.at(-1)![0];
    expect(final.where.status).toEqual({ notIn: ["recibido", "cancelado"] });
    expect(final.data.status).toBe("parcial");
    expect(h.tx!.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("si la transacción falla por otra cosa, la recepción se guarda sola (como antes) y avisa 0 stock", async () => {
    h.tx!.product.findFirst.mockRejectedValueOnce(new Error("timeout"));
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect((await res.json()).stockUpdated).toBe(0);
    expect(h.receiptCreate).toHaveBeenCalledTimes(2);
    expect(h.receiptCreate.mock.calls[1]).toHaveLength(2);
  });
});

describe("recibir un servicio (punto 8)", () => {
  it("no suma stock ni deja movimiento, pero la recepción cuenta", async () => {
    h.tx!.product.findFirst.mockResolvedValue({ id: 7, name: "Flete Lima", category: "Servicios", unit: "servicio", stock: 0, costPrice: 0, type: "service" });
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect((await res.json()).stockUpdated).toBe(0);
    expect(h.tx!.product.updateMany).not.toHaveBeenCalled();
    expect(h.tx!.inventoryMovement.create).not.toHaveBeenCalled();
    expect(h.receiptCreate).toHaveBeenCalledTimes(1);
  });
});
