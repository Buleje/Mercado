/**
 * Revisión 17-10 de Compras, puntos 4-8 (órdenes de compra).
 *
 * 4. Dos «Marcar recibida entera» a la vez sumaban dos veces lo que faltaba:
 *    el estado sólo se escribe si sigue como se leyó; el segundo recibe 409.
 * 5. Cancelar una orden a crédito sin pagos borraba la deuda entera aunque la
 *    mercadería hubiera llegado: ahora baja a lo que vale lo que llegó bueno.
 * 6. «Recibida entera» sumaba también lo marcado «no llegará».
 * 7. El almacenero veía la deuda en `?seguimiento=1`.
 * 8. Cerrar una orden con un servicio le sumaba stock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  getAll: vi.fn(),
  datosDeSeguimiento: vi.fn(),
  cerrarCuenta: vi.fn(),
  getRecibido: vi.fn(),
  getFaltantes: vi.fn(),
  logActivity: vi.fn(async (..._a: unknown[]) => undefined),
  db: {
    purchaseOrder: { findFirst: vi.fn(), updateMany: vi.fn() },
    payable: { findFirst: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    goodsReceipt: { findMany: vi.fn() },
    product: { findFirst: vi.fn(), updateMany: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn(), getOrSet: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterPurchase: vi.fn() } }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/jsondb", () => ({
  PurchasesDB: { getById: h.getById, update: h.update, getAll: h.getAll, datosDeSeguimiento: h.datosDeSeguimiento,
    pertenencia: vi.fn().mockResolvedValue({ existe: true, proveedorAjeno: false, productosAjenos: [] }) },
}));
vi.mock("@/lib/db/purchases-cancelar.db", () => ({ cerrarCuentaDeOrdenCancelada: h.cerrarCuenta }));
vi.mock("@/lib/compras/recibido-acumulado", async (original) => ({
  ...(await original<typeof import("@/lib/compras/recibido-acumulado")>()),
  getRecibidoAcumulado: h.getRecibido,
}));
vi.mock("@/lib/compras/aplicar-credito-recepcion", () => ({ getFaltantesAcreditados: h.getFaltantes }));

import { PurchasesDB } from "@/lib/db/purchases.db";
import { OrdenCambioDeEstadoError } from "@/lib/compras/estados-oc";
import { PATCH } from "@/app/api/purchases/[id]/route";
import { GET } from "@/app/api/purchases/route";

const OC = {
  id: "oc-carrera-123456",
  supplierId: "sup-1",
  supplierName: "Gloria",
  status: "parcial",
  total: 260,
  items: [
    { productId: 1, name: "Arroz", quantity: 10, unitCost: 20 },
    { productId: 2, name: "Aceite", quantity: 6, unitCost: 10 },
  ],
  igvIncluded: true,
};

const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/purchases/${OC.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: OC.id }) };

const filaOrden = (status: string) => ({
  id: OC.id, supplierId: "sup-1", supplierName: "Gloria", status, total: 260, items: [],
  igvIncluded: true, createdAt: new Date("2026-10-15T15:00:00Z"), updatedAt: new Date("2026-10-15T15:00:00Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ role: "admin", username: "qa", tenantId: "t-a" });
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.db));
  h.db.product.findFirst.mockImplementation(async ({ where }: { where: { id: number } }) => ({ id: where.id, stock: 0, costPrice: 0, type: "physical" }));
  h.db.product.updateMany.mockResolvedValue({ count: 1 });
  h.db.inventoryMovement.create.mockResolvedValue({});
  h.getRecibido.mockResolvedValue(new Map());
  h.getFaltantes.mockResolvedValue(new Map());
  h.update.mockImplementation(async (_t: string, _id: string, p: Record<string, unknown>) => ({ ...OC, ...p }));
});

describe("punto 4 — dos «Marcar recibida entera» a la vez", () => {
  it("PurchasesDB.update con siEstadoEs: la segunda llamada encuentra el estado cambiado y no escribe", async () => {
    let estado = "parcial";
    h.db.purchaseOrder.findFirst.mockImplementation(async () => filaOrden(estado));
    h.db.purchaseOrder.updateMany.mockImplementation(async ({ where, data }: { where: { status?: string }; data: { status?: string } }) => {
      if (where.status !== undefined && where.status !== estado) return { count: 0 };
      if (data.status) estado = data.status;
      return { count: 1 };
    });
    const primera = await PurchasesDB.update("t-a", OC.id, { status: "recibido" }, { siEstadoEs: "parcial" });
    expect(primera?.status).toBe("recibido");
    await expect(PurchasesDB.update("t-a", OC.id, { status: "recibido" }, { siEstadoEs: "parcial" }))
      .rejects.toMatchObject({ name: "OrdenCambioDeEstadoError", estado: "recibido" });
    expect(h.db.purchaseOrder.updateMany.mock.calls[1][0].where).toEqual({ id: OC.id, tenantId: "t-a", status: "parcial" });
  });

  it("sin siEstadoEs (editar notas o fecha) no condiciona el estado", async () => {
    h.db.purchaseOrder.findFirst.mockResolvedValue(filaOrden("parcial"));
    h.db.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    await PurchasesDB.update("t-a", OC.id, { notes: "x" });
    expect(h.db.purchaseOrder.updateMany.mock.calls[0][0].where).toEqual({ id: OC.id, tenantId: "t-a" });
  });

  it("la ruta pide el estado leído y responde 409 sin tocar el stock si otro ganó", async () => {
    h.getById.mockResolvedValue(OC);
    h.update.mockRejectedValueOnce(new OrdenCambioDeEstadoError("recibido"));
    const res = await PATCH(patch({ status: "recibido" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ahora está «Recibido»/);
    expect(h.update.mock.calls[0][3]).toEqual({ siEstadoEs: "parcial" });
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.db.product.updateMany).not.toHaveBeenCalled();
  });
});

describe("punto 6 — «Recibida entera» no suma lo que «no llegará»", () => {
  it("stock = pedido − recibido − lo acreditado como faltante", async () => {
    h.getById.mockResolvedValue(OC);
    h.getRecibido.mockResolvedValue(new Map([[1, 4]]));
    h.getFaltantes.mockResolvedValue(new Map([[1, 3], [2, 6]]));
    const res = await PATCH(patch({ status: "recibido" }), params);
    expect(res.status).toBe(200);
    expect(h.getFaltantes.mock.calls[0][1]).toBe("t-a");
    expect(h.db.product.updateMany).toHaveBeenCalledTimes(1); // el aceite: 6 de 6 no llegarán
    expect(h.db.product.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 1, tenantId: "t-a" }, data: { stock: 3 } });
    expect(h.db.inventoryMovement.create.mock.calls[0][0].data.quantity).toBe(3);
  });
});

describe("punto 8 — cerrar una orden con un servicio", () => {
  it("el servicio no suma stock ni deja movimiento; el producto sí", async () => {
    h.getById.mockResolvedValue(OC);
    h.db.product.findFirst.mockImplementation(async ({ where }: { where: { id: number } }) =>
      where.id === 2 ? { id: 2, stock: 0, costPrice: 0, type: "service" } : { id: 1, stock: 0, costPrice: 0, type: "physical" });
    const res = await PATCH(patch({ status: "recibido" }), params);
    expect(res.status).toBe(200);
    expect(h.db.product.updateMany).toHaveBeenCalledTimes(1);
    expect(h.db.product.updateMany.mock.calls[0][0].where.id).toBe(1);
    expect(h.db.inventoryMovement.create).toHaveBeenCalledTimes(1);
  });
});

describe("punto 5 — la deuda al cancelar", () => {
  const cancelar = async () => {
    const { cerrarCuentaDeOrdenCancelada } = await vi.importActual<typeof import("@/lib/db/purchases-cancelar.db")>("@/lib/db/purchases-cancelar.db");
    return cerrarCuentaDeOrdenCancelada("t-a", OC);
  };
  const cuenta = (extra: Record<string, unknown> = {}) => ({ id: "cxp-1", amount: 260, paidAmount: 0, description: "OC Gloria", ...extra });

  beforeEach(() => {
    h.db.$queryRaw.mockResolvedValue([{ id: "cxp-1" }]);
    h.db.payable.findFirst.mockResolvedValue(cuenta());
    h.db.payable.deleteMany.mockResolvedValue({ count: 1 });
    h.db.payable.updateMany.mockResolvedValue({ count: 1 });
    h.db.goodsReceipt.findMany.mockResolvedValue([]);
  });

  it("no llegó nada: se anula como antes, con la cuenta bloqueada y del negocio", async () => {
    expect(await cancelar()).toEqual({ resultado: "anulada", montoAntes: 260, montoDespues: 0 });
    expect(h.db.$queryRaw.mock.calls[0].slice(1)).toEqual(["t-a", OC.id]);
    expect(h.db.payable.deleteMany).toHaveBeenCalledWith({ where: { id: "cxp-1", tenantId: "t-a" } });
    expect(h.db.goodsReceipt.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t-a", purchaseOrderId: OC.id });
  });

  it("llegaron 4 de 10 arroces: la deuda baja a S/ 80 y lo anota", async () => {
    h.db.goodsReceipt.findMany.mockResolvedValue([{ id: "r1", itemsJson: [{ productId: 1, receivedQty: 4, condition: "ok" }] }]);
    expect(await cancelar()).toEqual({ resultado: "ajustada", montoAntes: 260, montoDespues: 80 });
    expect(h.db.payable.deleteMany).not.toHaveBeenCalled();
    const { where, data } = h.db.payable.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "cxp-1", tenantId: "t-a" });
    expect(data).toMatchObject({ amount: 80, status: "pendiente" });
    expect(data.description).toMatch(/^OC Gloria · Orden cancelada: −S\/ 180\.00 por lo que no llegó$/);
  });

  it("lo dañado no se paga (ya se descontó al recibir)", async () => {
    h.db.payable.findFirst.mockResolvedValue(cuenta({ amount: 240 }));
    h.db.goodsReceipt.findMany.mockResolvedValue([{ id: "r1", itemsJson: [
      { productId: 1, receivedQty: 3, condition: "ok" },
      { productId: 1, receivedQty: 1, condition: "dañado" },
    ] }]);
    expect(await cancelar()).toMatchObject({ resultado: "ajustada", montoDespues: 60 });
  });

  it("con pagos no se toca; sin cuenta devuelve null", async () => {
    h.db.payable.findFirst.mockResolvedValueOnce(cuenta({ paidAmount: 50 }));
    expect(await cancelar()).toMatchObject({ resultado: "conservada_con_pagos" });
    h.db.$queryRaw.mockResolvedValueOnce([]);
    expect(await cancelar()).toBeNull();
    expect(h.db.payable.deleteMany).not.toHaveBeenCalled();
    expect(h.db.payable.updateMany).not.toHaveBeenCalled();
  });

  it("la ruta devuelve qué pasó con la deuda y deja el rastro con las cifras", async () => {
    h.getById.mockResolvedValue(OC);
    h.cerrarCuenta.mockResolvedValue({ resultado: "ajustada", montoAntes: 260, montoDespues: 80 });
    const res = await PATCH(patch({ status: "cancelado", cancelReason: "llegó lo que había" }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cuentaPorPagar: "ajustada", montoAntes: 260, montoDespues: 80 });
    expect(h.cerrarCuenta.mock.calls[0][0]).toBe("t-a");
    // b-9 (17-10): el motivo va al final del rastro.
    expect(h.logActivity.mock.calls.map((c) => c[2])).toContain("Orden 123456 cancelada: la cuenta por pagar bajó de 260.00 a 80.00 (lo que llegó) — motivo: llegó lo que había");
  });
});

describe("punto 7 — el almacenero no ve la deuda en el seguimiento", () => {
  const get = () => new NextRequest("http://localhost/api/purchases?seguimiento=1");

  beforeEach(() => {
    h.getAll.mockResolvedValue([{ id: "oc1", items: OC.items }]);
    h.datosDeSeguimiento.mockImplementation(async (_t: string, _ids: string[], conCuentas = true) => ({
      recepciones: [],
      cuentas: conCuentas ? [{ purchaseOrderId: "oc1", amount: 260, paidAmount: 0, status: "pendiente", dueDate: null }] : [],
    }));
  });

  it("almacenero: no se lee la cuenta y la orden dice cuentaOculta", async () => {
    h.requireAdmin.mockResolvedValue({ role: "almacenero", username: "alm", tenantId: "t-a" });
    const [orden] = await (await GET(get())).json();
    expect(h.datosDeSeguimiento.mock.calls[0][2]).toBe(false);
    expect(orden.seguimiento).toMatchObject({ cuenta: null, cuentaOculta: true });
  });

  it("dueño y encargado sí la ven", async () => {
    for (const role of ["owner", "manager", "admin"]) {
      h.requireAdmin.mockResolvedValueOnce({ role, username: "x", tenantId: "t-a" });
      const [orden] = await (await GET(get())).json();
      expect(orden.seguimiento.cuenta).toMatchObject({ monto: 260 });
      expect(orden.seguimiento.cuentaOculta).toBeUndefined();
    }
  });
});
