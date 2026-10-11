/**
 * Categorías del catálogo (Productos e inventario › Categorías).
 *
 * Bug medido el 10-10 en main: Settings.categoryOrder = NULL y los productos
 * usan 24 categorías → el editor decía «Todavía no tienes categorías». Con HEAD
 * no existe ni la unión ni la ruta: estos tests fallan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  settings: { categoryOrder: [] as unknown[] },
  groupBy: vi.fn(),
  updateMany: vi.fn(),
  batchUpdate: vi.fn(),
  transaction: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterProduct: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: H.revalidateTag }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: vi.fn(async () => H.settings) } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      groupBy: (...a: unknown[]) => H.groupBy(...a),
      updateMany: (...a: unknown[]) => H.updateMany(...a),
    },
    batch: { updateMany: (...a: unknown[]) => H.batchUpdate(...a) },
    $transaction: (...a: unknown[]) => H.transaction(...a),
  },
}));

import { unirCategorias, normalizarCategoria, resolverDestinos } from "@/lib/db/categorias-catalogo.db";
import { GET, POST } from "@/app/api/admin/categorias/route";

const uso = (valor: string, activos: number, productos = activos) => ({ valor, productos, activos });

describe("unirCategorias", () => {
  it("sin lista guardada muestra las que usan los productos, juntando mayúsculas/tildes", () => {
    const filas = unirCategorias([], [
      uso("Abarrotes", 11),
      uso("abarrotes", 0, 4),
      uso("Servicios de salón", 8, 16),
      uso("Bebidas", 8),
    ]);
    expect(filas.map((f) => [f.label, f.activos, f.productos])).toEqual([
      ["Abarrotes", 11, 15],
      ["Servicios de salón", 8, 16], // a igual activos, más productos primero
      ["Bebidas", 8, 8],
    ]);
    // El id es la clave de Productos y stock (minúsculas), así el inventario encuentra el nombre.
    expect(filas[0]).toMatchObject({ id: "abarrotes", valores: ["Abarrotes", "abarrotes"], guardada: false, order: 0 });
    expect(filas[1].id).toBe("servicios de salón");
  });

  it("la guardada se queda con sus productos aunque el texto sea un id con guiones", () => {
    const guardadas = [
      { id: "madera-aserrada", label: "Madera aserrada", emoji: "", visible: true, order: 0 },
      { id: "transporte", label: "Transporte", emoji: "", visible: false, order: 1 },
    ];
    const filas = unirCategorias(guardadas, [uso("madera-aserrada", 2, 3), uso("alquiler", 1), uso("Madera", 0, 6)]);
    expect(filas.map((f) => [f.label, f.productos, f.guardada])).toEqual([
      ["Madera aserrada", 3, true],
      ["Transporte", 0, true],
      ["Alquiler", 1, false],
      ["Madera", 6, false],
    ]);
    expect(filas[1].visible).toBe(false);
  });

  it("resolverDestinos: un cambio sólo de mayúsculas se respeta; dos al mismo nombre van al mismo texto", () => {
    expect(resolverDestinos([{ valores: ["Abarrotes"], nuevo: "ABARROTES" }], [uso("Abarrotes", 11)])).toEqual([
      { valores: ["Abarrotes"], nuevo: "ABARROTES" },
    ]);
    const dos = resolverDestinos([{ valores: ["A"], nuevo: "Snacks" }, { valores: ["B"], nuevo: "snacks" }], [uso("A", 1), uso("B", 1)]);
    expect(dos.map((r) => r.nuevo)).toEqual(["Snacks", "Snacks"]);
  });

  it("normaliza tildes, mayúsculas y separadores", () => {
    expect(normalizarCategoria("Servicios de Salón")).toBe(normalizarCategoria("servicios-de-salon"));
  });
});

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/categorias", {
    method,
    headers: { "x-tenant-id": "otro-tenant", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.settings = { categoryOrder: [] };
  H.groupBy.mockResolvedValue([
    { category: "Abarrotes", active: true, _count: { _all: 11 } },
    { category: "abarrotes", active: false, _count: { _all: 4 } },
  ]);
  H.updateMany.mockImplementation((args: unknown) => args);
  H.batchUpdate.mockImplementation((args: unknown) => args);
  H.transaction.mockImplementation(async (ops: unknown[]) => ops.map(() => ({ count: 2 })));
});

describe("GET /api/admin/categorias", () => {
  it("lista con la cuenta de productos del tenant de la sesión (no del header)", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const { categorias } = await res.json();
    expect(categorias).toHaveLength(1);
    expect(categorias[0]).toMatchObject({ label: "Abarrotes", activos: 11, productos: 15 });
    expect(H.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", deletedAt: null } }));
  });

  it("sin sesión 401", async () => {
    H.auth = null;
    expect((await GET(req("GET"))).status).toBe(401);
  });
});

describe("POST /api/admin/categorias (renombrar)", () => {
  it("renombra los productos del tenant de la sesión", async () => {
    const res = await POST(req("POST", { renombres: [{ valores: ["Abarrotes", "abarrotes"], nuevo: "  Despensa " }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, actualizados: 2 });
    expect(H.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", category: { in: ["Abarrotes", "abarrotes"] } },
      data: { category: "Despensa" },
    });
    expect(H.revalidateTag).toHaveBeenCalledWith("tenant:t1:products", { expire: 0 });
  });

  it("un intercambio pasa por un nombre temporal (no junta todo en uno)", async () => {
    await POST(req("POST", { renombres: [{ valores: ["A"], nuevo: "B" }, { valores: ["B"], nuevo: "A" }] }));
    const pasos = H.updateMany.mock.calls.map(([a]) => a as { where: { category: { in: string[] } }; data: { category: string } });
    expect(pasos).toHaveLength(4);
    expect(pasos[0].data.category).toMatch(/^__renombrando_/);
    expect(pasos[3]).toMatchObject({ data: { category: "A" } });
    expect(pasos[3].where.category.in[0]).toMatch(/^__renombrando_.*1$/);
  });

  it("a un nombre que ya existe escrito distinto: junta en el existente, con sus lotes", async () => {
    H.groupBy.mockResolvedValue([
      { category: "Bebidas", active: true, _count: { _all: 8 } },
      { category: "bebidas", active: true, _count: { _all: 2 } },
      { category: "Gaseosas", active: true, _count: { _all: 3 } },
    ]);
    await POST(req("POST", { renombres: [{ valores: ["Gaseosas"], nuevo: "bebidas" }] }));
    expect(H.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", category: { in: ["Gaseosas", "bebidas"] } },
      data: { category: "Bebidas" },
    });
    expect(H.batchUpdate).toHaveBeenCalledWith({
      where: { tenantId: "t1", productCategory: { in: ["Gaseosas", "bebidas"] } },
      data: { productCategory: "Bebidas" },
    });
  });

  it("sin nombre nuevo 400 y no escribe", async () => {
    const res = await POST(req("POST", { renombres: [{ valores: ["Abarrotes"], nuevo: "   " }] }));
    expect(res.status).toBe(400);
    expect(H.transaction).not.toHaveBeenCalled();
  });
});
