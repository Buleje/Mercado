// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * PUT /api/products/[id] y el costo (FAC-2, costo en la fila del inventario):
 * `costPrice: null` QUITA el costo, no enviarlo lo conserva. Antes el `??`
 * convertía el null en «conservar» y la casilla vacía no podía limpiar nada.
 */
const upsert = vi.fn(async (p: Record<string, unknown>) => p);
const existente = { id: 7, tenantId: "t1", name: "Arroz", category: "abarrotes", price: 4.5, costPrice: 3.2, unit: "kg", active: true, stock: 10 };

vi.mock("@/lib/jsondb", () => ({
  ProductsDB: { getById: vi.fn(async () => ({ ...existente })), upsert: (p: Record<string, unknown>) => upsert(p) },
  PriceHistoryDB: { record: vi.fn(async () => undefined) },
}));
const record = vi.fn(async (_m: Record<string, unknown>) => undefined);
vi.mock("@/lib/db/inventory.db", () => ({ InventoryMovementsDB: { record: (m: Record<string, unknown>) => record(m) } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "qa" })) }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterProduct: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

const { PUT } = await import("@/app/api/products/[id]/route");

const put = (body: unknown) =>
  PUT(
    new NextRequest("http://localhost/api/products/7", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ id: "7" }) },
  );

beforeEach(() => {
  upsert.mockClear();
  record.mockClear();
});

describe("PUT /api/products/[id] — costo", () => {
  it("costPrice null quita el costo (casilla vacía)", async () => {
    const res = await put({ costPrice: null });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].costPrice).toBeNull();
  });

  it("sin costPrice en el cuerpo conserva el costo que había", async () => {
    const res = await put({ name: "Arroz extra" });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].costPrice).toBe(3.2);
  });

  it("un costo nuevo se guarda tal cual y no toca el resto", async () => {
    const res = await put({ costPrice: 2.8 });
    expect(res.status).toBe(200);
    const enviado = upsert.mock.calls[0][0];
    expect(enviado.costPrice).toBe(2.8);
    expect(enviado.price).toBe(4.5);
    expect(enviado.stock).toBe(10);
  });

  it("un costo de 0 no pisa el que había (y el stock de la OC sí entra)", async () => {
    const res = await put({ costPrice: 0, stock: 15, adjustReason: "llegó la OC" });
    expect(res.status).toBe(200);
    const enviado = upsert.mock.calls[0][0];
    expect(enviado.costPrice).toBe(3.2);
    expect(enviado.stock).toBe(15);
  });

  it("más de 2 decimales se redondea a céntimos", async () => {
    await put({ costPrice: 2.806 });
    expect(upsert.mock.calls[0][0].costPrice).toBe(2.81);
  });

  it("un costo negativo se rechaza sin escribir", async () => {
    const res = await put({ costPrice: -1 });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/products/[id] — b-9 (17-10): cambiar el stock a mano exige el motivo", () => {
  it("stock distinto sin motivo, vacío o sin 3 letras/números → 400 sin escribir", async () => {
    for (const adjustReason of [undefined, "", "   ", "?!", "ok"]) {
      const res = await put({ stock: 8, ...(adjustReason === undefined ? {} : { adjustReason }) });
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe("adjustReason");
    }
    expect(upsert).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("stock distinto con motivo → 200 y el kardex guarda el motivo en una línea", async () => {
    const res = await put({ stock: 8, adjustReason: " conteo:\n faltan 2 " });
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ type: "ajuste_negativo", quantity: 2, notes: "conteo: faltan 2" }));
  });

  it("mismo stock, o stock ilimitado (null), no pide motivo", async () => {
    expect((await put({ stock: 10, name: "Arroz" })).status).toBe(200);
    expect((await put({ stock: null })).status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });
});
