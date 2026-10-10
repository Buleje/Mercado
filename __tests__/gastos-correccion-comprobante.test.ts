/**
 * Remates de gastos (09-10): corregir el comprobante de un gasto guardado, el
 * «deshacer» que respeta la caja, pagar un fijo con «sale de la caja» y la
 * lectura del IGV con facturas exoneradas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  corregirGasto: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/jsondb", () => ({ ExpensesDB: { getById: h.getById, update: h.update, getSummary: vi.fn(async () => []) } }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (x: Record<string, string> = {}) => x }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/gasto-con-caja.db", () => ({
  GastoConCajaDB: { corregirGasto: h.corregirGasto },
  RetiroEnCajaError: class extends Error {},
}));

import { corregirComprobante, igvAlCambiarMonto } from "@/lib/gastos/corregir-comprobante";
import { igvDeGastosSinCredito, leerIgv } from "@/components/admin/unified/finanzas/resumen/igv";
import { restaurarGasto, type GastoBorrado } from "@/components/admin/compras/historial/restaurar";
import { pagarGastoFijo } from "@/components/admin/compras/historial/pagar-fijo";

const RUC_OK = "20100070970";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ role: "admin", username: "qaadmin", tenantId: "tenant-a" });
});

describe("corregirComprobante", () => {
  const facturaConIgv = { amount: 118, documentType: "factura", documentNumber: "F001-1", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 18 };

  it("sin tocar el papel ni el monto de una factura con IGV: nada que escribir", () => {
    expect(corregirComprobante(facturaConIgv, {})).toBeNull();
    expect(corregirComprobante({ amount: 50 }, { amount: 60 })).toBeNull();
  });

  it("sólo cambia el monto: el IGV se escala con el total (factura mixta conserva su proporción)", () => {
    const mixta = { ...facturaConIgv, igvAmount: 9 };
    const r = corregirComprobante(mixta, { amount: 236 });
    expect(r).toMatchObject({ ok: true, datos: { igvAmount: 18, afectoIgv: true, documentNumber: "F001-1" } });
  });

  it("sólo cambia el monto de una factura con IGV completo: se recalcula, no se escala el redondeo", () => {
    // S/ 10.06 mal tipeado (era S/ 1 006): escalar 1.53 ×100 daba 153.00.
    expect(corregirComprobante({ amount: 10.06, documentType: "factura", igvAmount: 1.53, afectoIgv: true }, { amount: 1006 }))
      .toMatchObject({ ok: true, datos: { igvAmount: 153.46 } });
    // La vista previa del modal usa la misma cuenta.
    expect(igvAlCambiarMonto(10.06, 1.53, 1006)).toBe(153.46);
    // Factura mixta: escala y nunca pasa del máximo.
    expect(igvAlCambiarMonto(118, 9, 236)).toBe(18);
    expect(igvAlCambiarMonto(0, 0, 118)).toBe(18);
  });

  it("un RUC viejo mal tipeado no bloquea corregir sólo el monto", () => {
    const r = corregirComprobante({ ...facturaConIgv, supplierRuc: "20100070971" }, { amount: 59 });
    expect(r).toMatchObject({ ok: true, datos: { igvAmount: 9 } });
  });

  it("pasar de sin comprobante a factura con IGV: se calcula del total, como en el alta", () => {
    const r = corregirComprobante({ amount: 118 }, { documentType: "factura", documentNumber: "f001 - 7", supplierRuc: RUC_OK, afectoIgv: true });
    expect(r).toEqual({ ok: true, datos: { documentType: "factura", documentNumber: "F001-7", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 18 } });
  });

  it("marcar exonerada guarda IGV 0, no vacío", () => {
    const r = corregirComprobante(facturaConIgv, { afectoIgv: false });
    expect(r).toMatchObject({ ok: true, datos: { afectoIgv: false, igvAmount: 0 } });
  });

  it("cambiar sólo el número conserva el IGV guardado", () => {
    const r = corregirComprobante({ ...facturaConIgv, igvAmount: 10 }, { documentNumber: "F001-2" });
    expect(r).toMatchObject({ ok: true, datos: { documentNumber: "F001-2", igvAmount: 10 } });
  });

  it("un RUC nuevo inválido se rechaza con su campo", () => {
    expect(corregirComprobante(facturaConIgv, { supplierRuc: "20100070971" })).toMatchObject({ ok: false, campo: "supplierRuc" });
  });
});

describe("PUT / GET /api/expenses/[id] con comprobante", () => {
  const ctx = { params: Promise.resolve({ id: "g1" }) };
  const put = (body: unknown) =>
    new NextRequest("http://localhost/api/expenses/g1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("un RUC mal escrito da 400 con el campo y no escribe nada (ni el monto)", async () => {
    h.getById.mockResolvedValue({ id: "g1", amount: 118, description: "gas" });
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ amount: 120, documentType: "factura", supplierRuc: "20100070971" }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ campo: "supplierRuc" });
    expect(h.corregirGasto).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("sólo el papel: se escribe revisado, sin pasar por la caja", async () => {
    h.getById.mockResolvedValue({ id: "g1", amount: 118, description: "gas" });
    h.update.mockResolvedValue({ id: "g1", amount: 118, documentType: "factura", igvAmount: 18 });
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ documentType: "factura", documentNumber: "F001-9", supplierRuc: RUC_OK, afectoIgv: true, attachmentUrl: "https://x.supabase.co/a.jpg" }), ctx);
    expect(res.status).toBe(200);
    expect(h.corregirGasto).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith("tenant-a", "g1", {
      documentType: "factura", documentNumber: "F001-9", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 18,
      attachmentUrl: "https://x.supabase.co/a.jpg",
    });
  });

  it("monto + papel: la plata va por la caja y el papel aparte", async () => {
    h.getById.mockResolvedValue({ id: "g1", amount: 100, description: "gas" });
    h.corregirGasto.mockResolvedValue({ gasto: { id: "g1", amount: 118 }, caja: { retiro: "ajustado", aviso: "se corrigió" } });
    h.update.mockResolvedValue({ id: "g1", amount: 118, documentType: "boleta" });
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ amount: 118, documentType: "boleta" }), ctx);
    expect(res.status).toBe(200);
    expect(h.corregirGasto).toHaveBeenCalledWith("tenant-a", "g1", { amount: 118 });
    expect(h.update).toHaveBeenCalledWith("tenant-a", "g1", expect.objectContaining({ documentType: "boleta", igvAmount: null }));
    expect(await res.json()).toMatchObject({ documentType: "boleta", caja: { retiro: "ajustado" } });
  });

  it("una foto que no es http(s) se rechaza (se pinta como enlace)", async () => {
    h.getById.mockResolvedValue({ id: "g1", amount: 10 });
    const { PUT } = await import("@/app/api/expenses/[id]/route");
    const res = await PUT(put({ attachmentUrl: "javascript:alert(1)" }), ctx);
    expect(res.status).toBe(400);
  });

  it("GET ?detalle=1 trae el gasto entero; sin él, el resumen de siempre", async () => {
    h.getById.mockResolvedValue({ id: "g1", amount: 10, documentType: "factura" });
    const { GET } = await import("@/app/api/expenses/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/expenses/g1?detalle=1"), ctx);
    expect(await res.json()).toMatchObject({ id: "g1", documentType: "factura" });
    const resumen = await GET(new NextRequest("http://localhost/api/expenses/summary"), { params: Promise.resolve({ id: "summary" }) });
    expect(await resumen.json()).toEqual([]);
  });
});

describe("IGV con facturas exoneradas", () => {
  it("sin comprobantes ni IGV en gastos, pero con exoneradas: lo dice", () => {
    const l = leerIgv({ mes: "2026-10", ventas: { igv: 0, comprobantes: 0 }, compras: { igv: 0, conIgv: 0, gastos: 4, exoneradas: 2 } });
    expect(l).toEqual({ tipo: "exoneradas", facturas: 2, gastos: 4 });
    expect(igvDeGastosSinCredito(l!)).toBe("Tus 2 facturas están exoneradas");
  });

  it("sin exoneradas sigue siendo «sin registro»", () => {
    const l = leerIgv({ mes: "2026-10", ventas: { igv: 0, comprobantes: 0 }, compras: { igv: 0, conIgv: 0, gastos: 3 } });
    expect(l).toEqual({ tipo: "sin_registro", gastos: 3 });
    expect(igvDeGastosSinCredito(l!)).toBe("Ningún gasto lo trae (0 de 3)");
  });

  it("con comprobantes emitidos, la fila de gastos nombra la exonerada", () => {
    const l = leerIgv({ mes: "2026-10", ventas: { igv: 50, comprobantes: 2 }, compras: { igv: 0, conIgv: 0, gastos: 1, exoneradas: 1 } });
    expect(l).toMatchObject({ tipo: "registrado", exoneradas: 1 });
    expect(igvDeGastosSinCredito(l!)).toBe("Tu factura está exonerada");
  });
});

describe("deshacer el borrado respeta la caja", () => {
  const base: GastoBorrado = { category: "otros", description: "gas", amount: 40, date: new Date().toISOString(), recurring: false, paymentMethod: "efectivo" };
  const respuesta = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
  const cuerpos = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));

  it("la plata había vuelto a la caja abierta → el gasto vuelve a salir de ella", async () => {
    const f = vi.fn(async () => respuesta(201, { id: "g2", caja: { sinCaja: false } }));
    vi.stubGlobal("fetch", f);
    const r = await restaurarGasto({ ...base, caja: { retiro: "devuelto", aviso: "vuelven" } });
    expect(cuerpos(f)[0]).toMatchObject({ salidaDeCaja: true, paymentMethod: "efectivo", amount: 40 });
    expect(r).toMatchObject({ tono: "ok" });
    expect(r.aviso).toMatch(/salieron otra vez/);
  });

  it("la caja ya se cerró → vuelve igual y avisa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(201, { id: "g2", caja: { sinCaja: true } })));
    const r = await restaurarGasto({ ...base, caja: { retiro: "devuelto", aviso: "vuelven" } });
    expect(r).toMatchObject({ tono: "aviso" });
    expect(r.aviso).toMatch(/ya no hay caja abierta/);
  });

  it("gasto de otro día (400) → se restaura sin caja y avisa cuánto quedó devuelto", async () => {
    const f = vi.fn().mockResolvedValueOnce(respuesta(400, { error: "sólo hoy" })).mockResolvedValueOnce(respuesta(201, { id: "g2" }));
    vi.stubGlobal("fetch", f);
    const r = await restaurarGasto({ ...base, caja: { retiro: "devuelto", aviso: "vuelven" } });
    expect(cuerpos(f)[1].salidaDeCaja).toBeUndefined();
    expect(r.aviso).toMatch(/anota un retiro de S\/ 40.00/);
  });

  it("caja cerrada al borrar (o sin caja) → restaura como siempre, sin tocarla", async () => {
    const f = vi.fn(async () => respuesta(201, { id: "g2" }));
    vi.stubGlobal("fetch", f);
    expect(await restaurarGasto({ ...base, caja: { retiro: "cerrada", aviso: "x" } })).toEqual({ aviso: null, tono: "ok" });
    expect(cuerpos(f)[0].salidaDeCaja).toBeUndefined();
  });
});

describe("pagar un gasto fijo", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 201 }));
  const cuerpo = (f: ReturnType<typeof vi.fn>) => JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));

  it("sin cambiar el medio ni sacar de la caja: el pedido de siempre", async () => {
    const f = ok({ id: "p1" });
    vi.stubGlobal("fetch", f);
    const r = await pagarGastoFijo("t1", { fechaIso: "2026-10-09T17:00:00.000Z", monto: 120, paymentMethod: "yape", salidaDeCaja: true }, "yape");
    expect(cuerpo(f)).toEqual({ date: "2026-10-09T17:00:00.000Z", amount: 120 });
    expect(r).toEqual({ ok: true, aviso: null, tono: "ok" });
  });

  it("efectivo con caja: manda el medio y salidaDeCaja; sin caja abierta avisa", async () => {
    const f = ok({ id: "p1", caja: { sinCaja: true } });
    vi.stubGlobal("fetch", f);
    const r = await pagarGastoFijo("t1", { fechaIso: "2026-10-09T17:00:00.000Z", monto: 120, paymentMethod: "efectivo", salidaDeCaja: true }, "efectivo");
    expect(cuerpo(f)).toMatchObject({ paymentMethod: "efectivo", salidaDeCaja: true });
    expect(r).toMatchObject({ ok: true, tono: "aviso" });
  });

  it("el error del servidor llega en palabras", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Sólo un gasto de hoy sale de la caja" }), { status: 400 })));
    expect(await pagarGastoFijo("t1", { fechaIso: "x", monto: 1, paymentMethod: "efectivo", salidaDeCaja: true })).toEqual({ ok: false, error: "Sólo un gasto de hoy sale de la caja" });
  });
});
