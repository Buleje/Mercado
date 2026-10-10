/**
 * Contrato «sale de la caja» (lib/caja/egreso-de-caja.ts) y las dos rutas que
 * lo usan: POST /api/expenses (+ from-template), PUT/DELETE /api/expenses/[id]
 * y POST /api/payables/[id]/payments.
 * Sólo el efectivo sale del cajón; el tenant sale de la sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  mover: vi.fn(),
  requireAdmin: vi.fn(),
  registrarGasto: vi.fn(),
  pagarCuenta: vi.fn(),
  getById: vi.fn(),
  getTpl: vi.fn(),
  corregirGasto: vi.fn(),
  borrarGasto: vi.fn(),
}));
vi.mock("@/lib/adelantos/movimiento-caja", () => ({ moverCajaEnTx: h.mover }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/jsondb", () => ({ ExpensesDB: { getById: h.getTpl }, PayablesDB: { getById: h.getById } }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/gasto-con-caja.db", () => {
  class PagoExcedeSaldoError extends Error {}
  class RetiroEnCajaError extends Error {}
  return {
    GastoConCajaDB: { registrarGasto: h.registrarGasto, pagarCuenta: h.pagarCuenta, corregirGasto: h.corregirGasto, borrarGasto: h.borrarGasto },
    PagoExcedeSaldoError,
    RetiroEnCajaError,
  };
});

import {
  diaDeCaja, egresoDeCajaEnTx, esDeHoyEnLima, etiquetaGasto, etiquetaGastoBorrado, etiquetaPagoAProveedor,
  idDevolucionDeGasto, idRetiroDeGasto, pedidoInvalido, saleDeCaja,
} from "@/lib/caja/egreso-de-caja";
import { limaDateKey } from "@/lib/utils";

/** «YYYY-MM-DD» de hoy en Lima corrido `n` días. */
const diaLima = (n: number) => {
  const [y, m, d] = limaDateKey().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ role: "admin", username: "qaadmin", tenantId: "tenant-a" });
});

describe("egreso de caja (helper)", () => {
  it("sólo el efectivo pedido sale de la caja", () => {
    expect(saleDeCaja(true, "efectivo")).toBe(true);
    expect(saleDeCaja(true, "Efectivo ")).toBe(true);
    expect(saleDeCaja(true, "yape")).toBe(false);
    expect(saleDeCaja(false, "efectivo")).toBe(false);
    expect(saleDeCaja(undefined, "efectivo")).toBe(false);
    expect(pedidoInvalido(true, "tarjeta")).toBe(true);
    expect(pedidoInvalido(true, null)).toBe(true);
    expect(pedidoInvalido(false, "tarjeta")).toBe(false);
  });

  it("etiquetas que reconoce el origen de la caja", () => {
    expect(etiquetaGasto("  gas de la  cocina ")).toBe("Gasto · gas de la cocina");
    expect(etiquetaGasto("")).toBe("Gasto · sin descripción");
    expect(etiquetaPagoAProveedor("Distribuidora Ucayali", "OC-12")).toBe("Pago a proveedor · Distribuidora Ucayali · OC-12");
    expect(etiquetaGasto("x".repeat(400)).length).toBe(160);
  });

  it("sólo un gasto de HOY (en Lima) sale de la caja", () => {
    // 21:00 del viernes 09/10 en Pucallpa = 02:00 UTC del sábado 10.
    const noche = new Date("2026-10-10T02:00:00Z");
    expect(esDeHoyEnLima("2026-10-09", noche)).toBe(true);
    expect(esDeHoyEnLima("2026-10-09T00:00:00.000Z", noche)).toBe(true); // new Date(input).toISOString()
    expect(esDeHoyEnLima("2026-10-09T20:30:00.000Z", noche)).toBe(true);
    expect(esDeHoyEnLima("2026-10-10", noche)).toBe(false);
    expect(esDeHoyEnLima("2026-10-02", noche)).toBe(false);
    expect(esDeHoyEnLima(undefined, noche)).toBe(true);
    expect(diaDeCaja(noche)).toBe("viernes 09/10");
  });

  it("el retiro de un gasto se encuentra por su id; la devolución, aparte", () => {
    expect(idRetiroDeGasto("g1")).toBe("gasto-caja-g1");
    expect(idDevolucionDeGasto("g1")).toBe("gasto-caja-g1-devuelto");
    expect(etiquetaGastoBorrado("gas")).toBe("Gasto borrado · gas (vuelve a la caja)");
  });

  it("anota un EGRESO en efectivo dentro de la transacción", async () => {
    h.mover.mockResolvedValue({ sinCaja: false, movimientoId: "m1" });
    const tx = {} as never;
    const r = await egresoDeCajaEnTx(tx, "tenant-a", { monto: 40, etiqueta: "Gasto · gas" });
    expect(r).toEqual({ sinCaja: false, movimientoId: "m1" });
    expect(h.mover).toHaveBeenCalledWith(tx, "tenant-a", { tipo: "egreso", monto: 40, metodo: "efectivo", etiqueta: "Gasto · gas" });
  });
});

describe("POST /api/expenses", () => {
  const gasto = { id: "g1", amount: 118, category: "servicios" };

  it("efectivo + salidaDeCaja: pide la salida y responde caja", async () => {
    h.registrarGasto.mockResolvedValue({ gasto, caja: { sinCaja: false } });
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "servicios", amount: 118, description: "gas", paymentMethod: "efectivo", salidaDeCaja: true, tenantId: "tenant-b" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "g1", caja: { sinCaja: false } });
    const [tenant, data, opciones] = h.registrarGasto.mock.calls[0];
    expect(tenant).toBe("tenant-a");
    expect(opciones).toEqual({ salidaDeCaja: true });
    expect(data.createdBy).toBe("qaadmin");
  });

  it("salidaDeCaja con Yape: 400 y no guarda", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "servicios", amount: 10, paymentMethod: "yape", salidaDeCaja: true }));
    expect(res.status).toBe(400);
    expect(h.registrarGasto).not.toHaveBeenCalled();
  });

  it("factura con IGV: el servidor calcula 18/118 y lo guarda", async () => {
    h.registrarGasto.mockResolvedValue({ gasto, caja: null });
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", {
      category: "servicios", amount: 118, paymentMethod: "transferencia",
      documentType: "factura", documentNumber: "f001-7", supplierRuc: "20100070970", afectoIgv: true, igvAmount: 0.5,
    }));
    expect(res.status).toBe(201);
    const data = h.registrarGasto.mock.calls[0][1];
    expect(data).toMatchObject({ documentType: "factura", documentNumber: "F001-7", supplierRuc: "20100070970", afectoIgv: true, igvAmount: 0.5 });
    expect(h.registrarGasto.mock.calls[0][2]).toEqual({ salidaDeCaja: false });
  });

  it("RUC con dígito malo: 400 con el campo", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "otros", amount: 5, documentType: "boleta", supplierRuc: "20100070971" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ campo: "supplierRuc" });
  });

  it("salidaDeCaja con fecha de ayer: 400 en la fecha y no guarda", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "otros", amount: 20, paymentMethod: "efectivo", salidaDeCaja: true, date: diaLima(-1) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ campo: "date" });
    expect(h.registrarGasto).not.toHaveBeenCalled();
  });

  it("salidaDeCaja con la fecha de hoy del formulario: pasa", async () => {
    h.registrarGasto.mockResolvedValue({ gasto, caja: { sinCaja: false } });
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "otros", amount: 20, paymentMethod: "efectivo", salidaDeCaja: true, date: diaLima(0) }));
    expect(res.status).toBe(201);
  });

  it("un gasto fijo no sale de la caja", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req("/api/expenses", { category: "alquiler", amount: 500, recurring: true, paymentMethod: "efectivo", salidaDeCaja: true }));
    expect(res.status).toBe(400);
  });
});

describe("gasto fijo pagado (from-template)", () => {
  it("salidaDeCaja con fecha de ayer: 400 y no guarda", async () => {
    h.getTpl.mockResolvedValue({ id: "t1", recurring: true, paymentMethod: "efectivo", category: "alquiler", amount: 500, description: "alquiler" });
    const { POST } = await import("@/app/api/expenses/from-template/[id]/route");
    const res = await POST(
      req("/api/expenses/from-template/t1", { salidaDeCaja: true, date: `${diaLima(-1)}T15:00:00.000Z` }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    expect(res.status).toBe(400);
    expect(h.registrarGasto).not.toHaveBeenCalled();
  });
});

describe("PUT / DELETE /api/expenses/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "g1" }) };
  const put = (body: unknown) =>
    new NextRequest("http://localhost/api/expenses/g1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("borrar un gasto que salió de la caja: la respuesta trae qué pasó con el retiro", async () => {
    h.borrarGasto.mockResolvedValue({ borrado: { id: "g1", description: "gas", amount: 40 }, caja: { retiro: "devuelto", aviso: "Los S/ 40.00 vuelven" } });
    const { DELETE } = await import("@/app/api/expenses/[id]/route");
    const res = await DELETE(new NextRequest("http://localhost/api/expenses/g1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, deleted: { id: "g1" }, caja: { retiro: "devuelto" } });
    expect(h.borrarGasto).toHaveBeenCalledWith("tenant-a", "g1");
  });

  it("corregir el monto devuelve el aviso de la caja", async () => {
    h.getTpl.mockResolvedValue({ id: "g1", amount: 40, description: "gas" });
    h.corregirGasto.mockResolvedValue({ gasto: { id: "g1", amount: 45, description: "gas" }, caja: { retiro: "cerrada", aviso: "quedó en la caja del jueves 09/10" } });
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ amount: 45 }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "g1", amount: 45, caja: { retiro: "cerrada" } });
  });

  it("pasar a Yape un gasto que salió de la caja abierta: 409", async () => {
    const { RetiroEnCajaError } = await import("@/lib/db/gasto-con-caja.db");
    h.getTpl.mockResolvedValue({ id: "g1", amount: 40 });
    h.corregirGasto.mockRejectedValue(new RetiroEnCajaError("bórralo y regístralo de nuevo"));
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ paymentMethod: "yape" }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ campo: "paymentMethod" });
  });
});

describe("POST /api/payables/[id]/payments", () => {
  const ctx = { params: Promise.resolve({ id: "p1" }) };

  it("efectivo + salidaDeCaja: paga y anota la salida", async () => {
    h.getById.mockResolvedValue({ id: "p1", amount: 100, paidAmount: 0 });
    h.pagarCuenta.mockResolvedValue({ cuenta: { id: "p1", paidAmount: 40 }, caja: { sinCaja: true } });
    const { POST } = await import("@/app/api/payables/[id]/payments/route");
    const res = await POST(req("/api/payables/p1/payments", { amount: 40, method: "efectivo", salidaDeCaja: true }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "p1", caja: { sinCaja: true } });
    expect(h.pagarCuenta.mock.calls[0][0]).toBe("tenant-a");
    expect(h.pagarCuenta.mock.calls[0][3]).toEqual({ salidaDeCaja: true });
  });

  it("sin salidaDeCaja: igual que antes, sin `caja` en la respuesta", async () => {
    h.getById.mockResolvedValue({ id: "p1", amount: 100, paidAmount: 0 });
    h.pagarCuenta.mockResolvedValue({ cuenta: { id: "p1", paidAmount: 40 }, caja: null });
    const { POST } = await import("@/app/api/payables/[id]/payments/route");
    const res = await POST(req("/api/payables/p1/payments", { amount: 40, method: "yape" }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).not.toHaveProperty("caja");
    expect(h.pagarCuenta.mock.calls[0][3]).toEqual({ salidaDeCaja: false });
  });

  it("salidaDeCaja con transferencia: 400 sin pagar", async () => {
    const { POST } = await import("@/app/api/payables/[id]/payments/route");
    const res = await POST(req("/api/payables/p1/payments", { amount: 40, method: "transferencia", salidaDeCaja: true }), ctx);
    expect(res.status).toBe(400);
    expect(h.pagarCuenta).not.toHaveBeenCalled();
  });
});
