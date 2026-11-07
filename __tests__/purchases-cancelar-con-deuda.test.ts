/**
 * Seguridad 17-10, punto 3 — PATCH /api/purchases/[id]:
 *  - cuerpo vacío respondía 500 (`req.json()` fuera del try) → 400.
 *  - el almacenero cancelaba una orden con deuda en Por pagar y con eso la
 *    bajaba o borraba → con deuda, sólo dueño/admin/encargado (403 con mensaje);
 *    sin deuda, como siempre.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  cerrarCuenta: vi.fn(),
  tieneDeuda: vi.fn(),
  payables: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/cache", () => ({ revalidateTenantTag: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { payable: { findMany: h.payables } } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/jsondb", () => ({
  PurchasesDB: {
    getById: h.getById,
    update: h.update,
    pertenencia: vi.fn().mockResolvedValue({ existe: true, proveedorAjeno: false, productosAjenos: [] }),
  },
}));
vi.mock("@/lib/db/purchases-cancelar.db", async (original) => ({
  ...(await original<typeof import("@/lib/db/purchases-cancelar.db")>()),
  cerrarCuentaDeOrdenCancelada: h.cerrarCuenta,
}));

import { PATCH } from "@/app/api/purchases/[id]/route";
import { ordenTieneDeudaPorPagar } from "@/lib/db/purchases-cancelar.db";

const OC = { id: "oc-123456", status: "pendiente", total: 100, items: [], igvIncluded: true };
const params = { params: Promise.resolve({ id: OC.id }) };
const patch = (body?: string) =>
  new NextRequest(`http://localhost/api/purchases/${OC.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
/** b-9 (17-10): cancelar exige el motivo; los casos que no lo prueban mandan uno. */
const cancelar = (cancelReason: string | undefined = "el proveedor no tiene stock") =>
  patch(JSON.stringify({ status: "cancelado", ...(cancelReason === undefined ? {} : { cancelReason }) }));
const sesion = (role: string) => ({ role, username: "u", tenantId: "t-a" });

beforeEach(() => {
  vi.clearAllMocks();
  h.getById.mockResolvedValue(OC);
  h.update.mockImplementation(async (_t: string, _id: string, p: Record<string, unknown>) => ({ ...OC, ...p }));
  h.cerrarCuenta.mockResolvedValue(null);
});

describe("cuerpo vacío o que no es JSON", () => {
  it.each([undefined, "", "no-es-json", "null"])("«%s» → 400 sin tocar la orden", async (body) => {
    h.requireAdmin.mockResolvedValue(sesion("admin"));
    const res = await PATCH(patch(body), params);
    expect(res.status).toBe(400);
    expect(h.getById).not.toHaveBeenCalled();
  });
});

describe("cancelar una orden con deuda en Por pagar", () => {
  it("almacenero con deuda pendiente: 403 con mensaje y no se cancela", async () => {
    h.requireAdmin.mockResolvedValue(sesion("almacenero"));
    h.payables.mockResolvedValue([{ amount: 100, paidAmount: 0 }]);
    const res = await PATCH(cancelar(), params);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/deuda en Por pagar/);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.cerrarCuenta).not.toHaveBeenCalled();
    expect(h.payables).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t-a", purchaseOrderId: OC.id } }));
  });

  it("almacenero sin deuda (contado o ya pagada): cancela como siempre", async () => {
    h.requireAdmin.mockResolvedValue(sesion("almacenero"));
    for (const cuentas of [[], [{ amount: 100, paidAmount: 100 }]]) {
      h.payables.mockResolvedValueOnce(cuentas);
      const res = await PATCH(cancelar(), params);
      expect(res.status).toBe(200);
    }
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it.each(["admin", "owner", "manager"])("%s cancela con deuda (ni se consulta)", async (role) => {
    h.requireAdmin.mockResolvedValue(sesion(role));
    const res = await PATCH(cancelar(), params);
    expect(res.status).toBe(200);
    expect(h.payables).not.toHaveBeenCalled();
    expect(h.cerrarCuenta).toHaveBeenCalledTimes(1);
  });

  it("b-9 · sin motivo, vacío o sin 3 letras/números → 400 y la orden y su deuda quedan igual", async () => {
    h.requireAdmin.mockResolvedValue(sesion("admin"));
    for (const motivo of [undefined, "", "   ", "-.-", "no"]) {
      const res = await PATCH(patch(JSON.stringify({ status: "cancelado", ...(motivo === undefined ? {} : { cancelReason: motivo }) })), params);
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe("cancelReason");
    }
    expect(h.update).not.toHaveBeenCalled();
    expect(h.cerrarCuenta).not.toHaveBeenCalled();
  });

  it("b-9 · con motivo → 200 y se guarda en una línea en cancelReason", async () => {
    h.requireAdmin.mockResolvedValue(sesion("admin"));
    const res = await PATCH(cancelar("  el proveedor\n cerró "), params);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith("t-a", OC.id, expect.objectContaining({ status: "cancelado", cancelReason: "el proveedor cerró" }), expect.anything());
  });

  it("b-9 · el almacenero con deuda sigue viendo el 403 aunque no mande motivo", async () => {
    h.requireAdmin.mockResolvedValue(sesion("almacenero"));
    h.payables.mockResolvedValue([{ amount: 100, paidAmount: 0 }]);
    expect((await PATCH(cancelar(undefined), params)).status).toBe(403);
  });

  it("ordenTieneDeudaPorPagar cuenta el saldo, no la cuenta pelada", async () => {
    h.payables.mockResolvedValueOnce([{ amount: "50.00", paidAmount: "20.00" }]);
    await expect(ordenTieneDeudaPorPagar("t-a", OC.id)).resolves.toBe(true);
    h.payables.mockResolvedValueOnce([{ amount: "50.00", paidAmount: "50.00" }]);
    await expect(ordenTieneDeudaPorPagar("t-a", OC.id)).resolves.toBe(false);
  });
});
