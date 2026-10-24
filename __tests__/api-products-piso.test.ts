// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Piso de rebajas en la ficha y en los precios en lote (Brandon 19-10): bajar
 * un precio por debajo de costo + piso del negocio responde 409 con la lista y
 * NO escribe; con `confirmarBajoPiso: true` se guarda y queda en el registro.
 * Subidas y productos sin costo pasan. Precio y costo salen de la base.
 */
const H = vi.hoisted(() => ({
  flags: { margenesRebajas: { pisoSobreCosto: 5, margenMinimoSugerido: 15 } } as Record<string, unknown>,
  existente: { id: 7, tenantId: "t1", name: "Leche Gloria", category: "lacteos", price: 5, costPrice: 3.8, unit: "u", active: true, stock: 10 } as Record<string, unknown> | null,
  filas: [] as Array<{ id: number; name: string; price: number; costPrice: number | null }>,
}));

const upsert = vi.fn(async (p: Record<string, unknown>) => p);
const logActivity = vi.fn(async (..._a: unknown[]) => undefined);
const getFeatureFlags = vi.fn(async () => H.flags);
const findMany = vi.fn(async (_a?: unknown) => H.filas);
const update = vi.fn((a: unknown) => a);
const updateMany = vi.fn(async (_a?: unknown) => ({ count: 1 }));
const transaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock("@/lib/jsondb", () => ({
  ProductsDB: { getById: vi.fn(async (_t: string, id: number) => (H.existente && id === 7 ? { ...H.existente } : null)), upsert: (p: Record<string, unknown>) => upsert(p) },
  PriceHistoryDB: { record: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { getFeatureFlags: () => getFeatureFlags() } }));
vi.mock("@/lib/db/inventory.db", () => ({ InventoryMovementsDB: { record: vi.fn(async () => undefined) } }));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { bulkDelete: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "qaadmin", role: "admin" })) }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterProduct: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/generated/prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: (a: unknown) => findMany(a), update: (a: unknown) => update(a), updateMany: (a: unknown) => updateMany(a) },
    priceHistory: { create: vi.fn((a: unknown) => a) },
    $transaction: (ops: unknown[]) => transaction(ops),
  },
}));

const { PUT } = await import("@/app/api/products/[id]/route");
const { PATCH: PATCH_LOTE } = await import("@/app/api/products/bulk-price/route");
const { POST: POST_BULK } = await import("@/app/api/products/bulk/route");
const { requireAdmin } = await import("@/lib/require-admin");

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const put = (body: unknown, id = "7") => PUT(json(`/api/products/${id}`, "PUT", body), { params: Promise.resolve({ id }) });
const patchLote = (body: unknown) => PATCH_LOTE(json("/api/products/bulk-price", "PATCH", body));
const postBulk = (body: unknown) => POST_BULK(json("/api/products/bulk", "POST", body));
const pisoLogs = () => logActivity.mock.calls.filter((c) => c[0] === "Precio bajo piso");

beforeEach(() => {
  vi.clearAllMocks();
  H.existente = { id: 7, tenantId: "t1", name: "Leche Gloria", category: "lacteos", price: 5, costPrice: 3.8, unit: "u", active: true, stock: 10 };
  H.filas = [
    { id: 7, name: "Leche Gloria", price: 5, costPrice: 3.8 },
    { id: 8, name: "Arroz Costeño", price: 4, costPrice: null },
  ];
});

describe("PUT /api/products/[id] — piso de rebajas", () => {
  it("bajar bajo costo + 5 % sin confirmar = 409 con el aviso y no escribe", async () => {
    const res = await put({ price: 3.5 });
    expect(res.status).toBe(409);
    const d = await res.json();
    expect(d.codigo).toBe("bajo-piso");
    expect(d.error).toBe("Leche Gloria: queda bajo costo + 5 % (S/ 3,99)");
    expect(d.avisos).toEqual([expect.objectContaining({ productId: 7, piso: 3.99, precioNuevo: 3.5, costo: 3.8 })]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("con confirmarBajoPiso guarda y anota quién confirmó", async () => {
    const res = await put({ price: 3.5, confirmarBajoPiso: true });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].price).toBe(3.5);
    expect(upsert.mock.calls[0][0]).not.toHaveProperty("confirmarBajoPiso");
    expect(pisoLogs()).toHaveLength(1);
    expect(pisoLogs()[0][2]).toContain("Bajo piso confirmado por qaadmin: Leche Gloria");
    expect(pisoLogs()[0][6]).toBe("t1");
  });

  it("una subida pasa sin leer Ajustes", async () => {
    const res = await put({ price: 6 });
    expect(res.status).toBe(200);
    expect(getFeatureFlags).not.toHaveBeenCalled();
    expect(pisoLogs()).toHaveLength(0);
  });

  it("rebajar en el piso o encima pasa", async () => {
    expect((await put({ price: 3.99 })).status).toBe(200);
  });

  it("sin costo pasa", async () => {
    H.existente = { ...H.existente, costPrice: undefined };
    expect((await put({ price: 1 })).status).toBe(200);
  });

  it("el costo nuevo del mismo cuerpo es el que manda", async () => {
    // Bajó la lista del proveedor: costo 3 → piso 3,15; 3,50 ya pasa.
    expect((await put({ price: 3.5, costPrice: 3 })).status).toBe(200);
  });

  it("el piso del negocio sale de Ajustes (10 % → 4,18)", async () => {
    H.flags = { margenesRebajas: { pisoSobreCosto: 10, margenMinimoSugerido: 15 } };
    const d = await (await put({ price: 4.1 })).json();
    expect(d.avisos[0].piso).toBe(4.18);
    H.flags = { margenesRebajas: { pisoSobreCosto: 5, margenMinimoSugerido: 15 } };
  });

  it("producto de otro negocio = 404 sin escribir", async () => {
    const res = await put({ price: 1 }, "99");
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sin sesión = 401", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireAdmin).mockResolvedValueOnce(NextResponse.json({ error: "No autorizado" }, { status: 401 }) as never);
    expect((await put({ price: 1 })).status).toBe(401);
  });
});

describe("PATCH /api/products/bulk-price — piso de rebajas", () => {
  it("una fila bajo el piso = 409 y no escribe ninguna", async () => {
    const res = await patchLote({ updates: [{ productId: 7, newPrice: 3.5 }, { productId: 8, newPrice: 3 }] });
    expect(res.status).toBe(409);
    const d = await res.json();
    expect(d.avisos.map((a: { productId: number }) => a.productId)).toEqual([7]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("con confirmarBajoPiso escribe y anota", async () => {
    const res = await patchLote({ updates: [{ productId: 7, newPrice: 3.5 }], confirmarBajoPiso: true });
    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(pisoLogs()).toHaveLength(1);
  });

  it("subidas y productos sin costo pasan", async () => {
    const res = await patchLote({ updates: [{ productId: 7, newPrice: 6 }, { productId: 8, newPrice: 0.5 }] });
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(2);
  });

  it("los productos se buscan sólo en el negocio de la sesión", async () => {
    await patchLote({ updates: [{ productId: 7, newPrice: 6 }] });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t1" } });
  });
});

describe("POST /api/products/bulk — precios en lote del inventario", () => {
  it("bajar S/ 2 a todos deja uno bajo el piso = 409 y no escribe", async () => {
    const res = await postBulk({ ids: [7, 8], fields: { priceDelta: -2 } });
    expect(res.status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("precio fijo bajo el piso = 409; con confirmar escribe", async () => {
    expect((await postBulk({ ids: [7], fields: { price: 3 } })).status).toBe(409);
    expect(updateMany).not.toHaveBeenCalled();
    const ok = await postBulk({ ids: [7], fields: { price: 3 }, confirmarBajoPiso: true });
    expect(ok.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(pisoLogs()).toHaveLength(1);
  });

  it("subir 10 % pasa", async () => {
    expect((await postBulk({ ids: [7, 8], fields: { priceAdjust: 10 } })).status).toBe(200);
  });

  it("cambiar la categoría no lee precios", async () => {
    expect((await postBulk({ ids: [7], fields: { category: "x" } })).status).toBe(200);
    expect(findMany).not.toHaveBeenCalled();
  });
});
