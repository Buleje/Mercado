/**
 * PUT /api/expenses/[id] sobre el gasto del pago de la semana de RRHH
 * (segunda revisión 24-10, doble pago): el papel de Mi Plata reescribía la
 * marca `RRHH-<lunes>-<id>` al editar CUALQUIER campo del comprobante
 * (`{afectoIgv:false}` la pasaba a MAYÚSCULAS, `{documentType:null}` la
 * borraba), la semana se veía sin pagar y se podía pagar otra vez. Fuera de
 * descripción, nota y foto: 409 `pago_rrhh` y no se escribe nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  corregirGasto: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "qa", role: "admin" })),
}));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/jsondb", () => ({ ExpensesDB: { getById: h.getById, update: h.update, getSummary: vi.fn(async () => []) } }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/gasto-con-caja.db", () => ({
  GastoConCajaDB: { corregirGasto: h.corregirGasto },
  GastoDePagoRrhhError: class extends Error {},
  RetiroEnCajaError: class extends Error {},
}));

import { PUT } from "@/app/api/expenses/[id]/route";
import { MENSAJE_GASTO_DE_PAGO_RRHH } from "@/lib/rrhh/pago-semana";

const ctx = { params: Promise.resolve({ id: "g1" }) };
const put = (body: unknown) =>
  new NextRequest("http://localhost/api/expenses/g1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const gastoRrhh = (documentNumber: string | null = "RRHH-2026-10-19-cmabc123") => ({
  id: "g1", amount: 420, category: "personal", description: "Pago de la semana · Juan",
  documentType: "recibo", documentNumber, supplierRuc: null, igvAmount: null, afectoIgv: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.getById.mockResolvedValue(gastoRrhh());
  h.corregirGasto.mockImplementation(async () => ({ gasto: gastoRrhh(), caja: null }));
  h.update.mockImplementation(async () => gastoRrhh());
});

describe("PUT /api/expenses/[id]: el gasto del pago de RRHH", () => {
  it.each([
    ["afectoIgv", { afectoIgv: false }],
    ["documentType", { documentType: null }],
    ["documentType", { documentType: "boleta" }],
    ["category", { category: "otros" }],
    ["amount", { amount: 430 }],
    ["date", { date: "2026-10-20T12:00:00.000Z" }],
    ["paymentMethod", { paymentMethod: "efectivo" }],
    ["supplierRuc", { supplierRuc: "20100070970" }],
  ])("%s → 409 pago_rrhh, sin escribir nada", async (campo, body) => {
    const res = await PUT(put(body), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MENSAJE_GASTO_DE_PAGO_RRHH, campo, codigo: "pago_rrhh" });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.corregirGasto).not.toHaveBeenCalled();
  });

  it("el formulario entero de Mi Plata con lo mismo + nota nueva: 200 (sólo frena lo que cambia)", async () => {
    const igual = { amount: 420, category: "personal", description: "Pago de la semana · Juan", documentType: "recibo", documentNumber: "RRHH-2026-10-19-cmabc123", supplierRuc: null, igvAmount: null };
    const res = await PUT(put({ ...igual, notes: "pagado en efectivo" }), ctx);
    expect(res.status).toBe(200);
  });

  it("el formulario entero con el monto cambiado: 409", async () => {
    const res = await PUT(put({ amount: 430, category: "personal", documentType: "recibo", notes: "x" }), ctx);
    expect(res.status).toBe(409);
    expect(h.corregirGasto).not.toHaveBeenCalled();
  });

  it("la nota sí se puede cambiar: 200", async () => {
    const res = await PUT(put({ notes: "x" }), ctx);
    expect(res.status).toBe(200);
    expect(h.corregirGasto).toHaveBeenCalledWith("t1", "g1", { notes: "x" });
  });

  it("descripción y foto también: 200", async () => {
    const res = await PUT(put({ description: "Pago de Juan", attachmentUrl: "https://x.test/foto.jpg" }), ctx);
    expect(res.status).toBe(200);
    expect(h.corregirGasto).toHaveBeenCalledWith("t1", "g1", { description: "Pago de Juan" });
    expect(h.update).toHaveBeenCalledWith("t1", "g1", { attachmentUrl: "https://x.test/foto.jpg" });
  });

  it("la marca ya en MAYÚSCULAS (o minúsculas) se sigue reconociendo", async () => {
    h.getById.mockResolvedValue(gastoRrhh("RRHH-2026-10-19-CMABC123"));
    expect((await PUT(put({ afectoIgv: false }), ctx)).status).toBe(409);
    h.getById.mockResolvedValue(gastoRrhh("rrhh-2026-10-19-cmabc123"));
    expect((await PUT(put({ category: "otros" }), ctx)).status).toBe(409);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("un gasto común cambia de categoría como siempre", async () => {
    h.getById.mockResolvedValue(gastoRrhh(null));
    const res = await PUT(put({ category: "otros" }), ctx);
    expect(res.status).toBe(200);
    expect(h.corregirGasto).toHaveBeenCalledWith("t1", "g1", { category: "otros" });
  });
});
