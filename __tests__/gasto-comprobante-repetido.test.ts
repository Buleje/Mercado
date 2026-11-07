/**
 * Aviso de factura de compra repetida (como QuickBooks): el mismo RUC +
 * serie-número anotado dos veces duplica el gasto y el IGV. El servidor
 * pregunta con un 409 y guarda si la persona confirma que es otra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  registrarGasto: vi.fn(),
  repetido: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/jsondb", () => ({ ExpensesDB: {} }));
vi.mock("@/lib/db/expenses.db", () => ({ ExpensesDB: { comprobanteRepetido: h.repetido } }));
vi.mock("@/lib/db/gasto-con-caja.db", () => ({ GastoConCajaDB: { registrarGasto: h.registrarGasto } }));

import { avisoDeComprobanteRepetido, claveDeComprobante, gastoConMismoComprobante } from "@/lib/gastos/factura-repetida";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/expenses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const factura = {
  category: "insumos", amount: 120, description: "harina", paymentMethod: "transferencia",
  documentType: "factura", documentNumber: "f001 - 0000123", supplierRuc: "20100070970", afectoIgv: true,
};
const yaAnotada = { id: "g-viejo", dia: "2026-10-03", monto: 120, descripcion: "harina", tipo: "factura" };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ role: "admin", username: "qaadmin", tenantId: "tenant-a" });
  h.registrarGasto.mockResolvedValue({ gasto: { id: "g-nuevo" }, caja: null });
  h.repetido.mockResolvedValue(null);
});

describe("serie-número comparable", () => {
  it("mayúsculas, espacios y ceros a la izquierda del correlativo no hacen otro papel", () => {
    expect(claveDeComprobante("f001 - 0000123")).toBe("F001-123");
    expect(claveDeComprobante("F001-123")).toBe("F001-123");
    expect(claveDeComprobante("F001 123")).toBe("F001-123");
    expect(claveDeComprobante("E001-45")).not.toBe(claveDeComprobante("F001-45"));
    expect(claveDeComprobante("  ")).toBeNull();
    expect(claveDeComprobante(null)).toBeNull();
  });

  it("el aviso dice el día con su nombre, el monto y pregunta", () => {
    expect(avisoDeComprobanteRepetido(yaAnotada)).toBe("Ya anotaste esta factura el sábado 03/10 por S/ 120.00 — ¿es otra?");
    expect(avisoDeComprobanteRepetido({ ...yaAnotada, tipo: null })).toMatch(/^Ya anotaste este comprobante el/);
  });

  it("la fila de la base: el día que se anotó (medianoche UTC = ese día), monto como número", () => {
    expect(gastoConMismoComprobante({ id: "x", date: new Date("2026-10-03T00:00:00Z"), amount: "120.5", description: null, documentType: "boleta" }))
      .toEqual({ id: "x", dia: "2026-10-03", monto: 120.5, descripcion: "", tipo: "boleta" });
  });
});

describe("POST /api/expenses con un comprobante ya anotado", () => {
  it("409 con el aviso y el gasto anterior; no guarda", async () => {
    h.repetido.mockResolvedValue(yaAnotada);
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req(factura));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ codigo: "COMPROBANTE_REPETIDO", campo: "documentNumber", repetido: { id: "g-viejo" }, error: expect.stringMatching(/^Ya anotaste esta factura/) });
    // Busca en ESTE negocio con el número ya normalizado.
    expect(h.repetido).toHaveBeenCalledWith("tenant-a", "20100070970", "F001-0000123", expect.anything());
    expect(h.registrarGasto).not.toHaveBeenCalled();
  });

  it("«Sí, es otra» (confirmarDuplicado): guarda sin volver a preguntar", async () => {
    h.repetido.mockResolvedValue(yaAnotada);
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req({ ...factura, confirmarDuplicado: true }));
    expect(res.status).toBe(201);
    expect(h.repetido).not.toHaveBeenCalled();
    expect(h.registrarGasto).toHaveBeenCalledOnce();
  });

  it("sin RUC o sin número no hay con qué comparar: guarda directo", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req({ category: "otros", amount: 10, description: "pan", paymentMethod: "yape", documentType: "boleta", documentNumber: "B001-9" }));
    expect(res.status).toBe(201);
    expect(h.repetido).not.toHaveBeenCalled();
  });

  it("un comprobante que no estaba: guarda", async () => {
    const { POST } = await import("@/app/api/expenses/route");
    const res = await POST(req(factura));
    expect(res.status).toBe(201);
    expect(h.repetido).toHaveBeenCalledOnce();
  });
});
