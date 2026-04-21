/**
 * Tests unitarios — GET /api/marketplace/products/check-exists
 *
 * Contexto (bug 2026-04-19):
 *  El cart en /marketplace validaba items contra `/api/products?active=true`
 *  que solo devuelve productos del tenant actual. Como el carrito del
 *  marketplace cruza stores (items de múltiples tenants), el endpoint legacy
 *  marcaba los items ajenos como "inexistentes" y los borraba al hidratar.
 *
 *  Este endpoint nuevo resuelve ese bug: verifica existencia cross-store
 *  ignorando tenantId del request, solo filtrando active=true y deletedAt=null.
 *
 * Cubre:
 *  1. Sin `?ids` → { existingIds: [], missingIds: [] } (200).
 *  2. Mix de ids existentes + inexistentes → particiona correctamente.
 *  3. Único id inexistente → missingIds contiene ese id.
 *  4. Basura mezclada (no-numéricos, negativos, cero) → se descarta el ruido.
 *  5. Cap a MAX_IDS=100 → pasar 150 solo procesa 100.
 *  6. Producto con active=false o deletedAt → missing (Prisma ya lo filtra).
 *  7. Error de DB → soft-fail: 200 con existingIds=[...caps], missingIds=[].
 *  8. Ids duplicados → se preservan en el input capped (no dedupe).
 *  9. Espacios alrededor de los ids (`?ids= 1 , 2 `) → se trimean.
 * 10. Response contiene headers de cache (s-maxage=30, swr=60).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── server-only guard ─────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock: logger (el endpoint loguea en el soft-fail path) ────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock: prisma.product.findMany ────────────────────────────────────────────
const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: mockFindMany,
    },
  },
}));

// ── Import SUT AFTER mocks ───────────────────────────────────────────────────
import { GET } from "@/app/api/marketplace/products/check-exists/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(query: string): NextRequest {
  const url = `http://localhost/api/marketplace/products/check-exists${query}`;
  return new NextRequest(new URL(url));
}

type ExistsPayload = { existingIds: number[]; missingIds: number[] };

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/check-exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1: sin ?ids → short-circuit sin tocar DB ────────────────────────────────
  it("sin ?ids devuelve listas vacías y 200 sin tocar la DB", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body).toEqual({ existingIds: [], missingIds: [] });

    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("con ?ids vacío ('?ids=') también hace short-circuit sin tocar la DB", async () => {
    const res = await GET(makeReq("?ids="));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body).toEqual({ existingIds: [], missingIds: [] });

    expect(mockFindMany).not.toHaveBeenCalled();
  });

  // ── 2: mix existentes + inexistentes ────────────────────────────────────────
  it("?ids=1,2,3 con 1 y 3 activos → existingIds=[1,3], missingIds=[2]", async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }, { id: 3 }]);

    const res = await GET(makeReq("?ids=1,2,3"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([1, 3]);
    expect(body.missingIds).toEqual([2]);

    // Verifica que el where NO filtra por tenantId (cross-store)
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0]![0] as {
      where: { id: { in: number[] }; active: boolean; deletedAt: null; tenantId?: unknown };
      select: { id: boolean };
    };
    expect(call.where.id.in).toEqual([1, 2, 3]);
    expect(call.where.active).toBe(true);
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.tenantId).toBeUndefined();
    expect(call.select).toEqual({ id: true });
  });

  // ── 3: id inexistente ───────────────────────────────────────────────────────
  it("?ids=999999 inexistente → existingIds=[], missingIds=[999999]", async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeReq("?ids=999999"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([]);
    expect(body.missingIds).toEqual([999999]);
  });

  // ── 4: basura mezclada → solo el 1 sobrevive al filter ──────────────────────
  it("?ids=abc,1,-5,0 descarta no-numéricos, negativos y cero; procesa solo el 1", async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }]);

    const res = await GET(makeReq("?ids=abc,1,-5,0"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([1]);
    expect(body.missingIds).toEqual([]);

    // La query a Prisma solo recibió el id 1 (los demás filtrados)
    const call = mockFindMany.mock.calls[0]![0] as { where: { id: { in: number[] } } };
    expect(call.where.id.in).toEqual([1]);
  });

  it("?ids=abc,1,-5,0 sigue devolviendo missingIds=[1] si la DB no lo encuentra", async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await GET(makeReq("?ids=abc,1,-5,0"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([]);
    expect(body.missingIds).toEqual([1]);
  });

  // ── 5: cap a MAX_IDS=100 ────────────────────────────────────────────────────
  it("pasar 150 ids → solo procesa los primeros 100 (MAX_IDS cap)", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => i + 1); // 1..150
    const idsCsv = ids.join(",");

    // Simulamos que los primeros 100 existen todos
    mockFindMany.mockResolvedValue(ids.slice(0, 100).map((id) => ({ id })));

    const res = await GET(makeReq(`?ids=${idsCsv}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toHaveLength(100);
    expect(body.missingIds).toEqual([]); // los que pasaron el cap existen todos

    // La query a Prisma recibe exactamente 100 ids (101..150 nunca llegan)
    const call = mockFindMany.mock.calls[0]![0] as { where: { id: { in: number[] } } };
    expect(call.where.id.in).toHaveLength(100);
    expect(call.where.id.in[0]).toBe(1);
    expect(call.where.id.in[99]).toBe(100);
    expect(call.where.id.in).not.toContain(101);
    expect(call.where.id.in).not.toContain(150);
  });

  // ── 6: active=false / deletedAt → Prisma los filtra, van a missing ──────────
  it("producto con active=false o deletedAt NO aparece en existingIds", async () => {
    // Simulamos: pedimos 1,2,3 — la DB (con filtro active=true + deletedAt=null)
    // solo devuelve el 1. El 2 está soft-deleted, el 3 está inactive.
    mockFindMany.mockResolvedValue([{ id: 1 }]);

    const res = await GET(makeReq("?ids=1,2,3"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([1]);
    expect(body.missingIds).toEqual([2, 3]);

    // El where pasa active:true y deletedAt:null a Prisma (es quien filtra)
    const call = mockFindMany.mock.calls[0]![0] as {
      where: { active: boolean; deletedAt: null };
    };
    expect(call.where.active).toBe(true);
    expect(call.where.deletedAt).toBeNull();
  });

  // ── 7: error de DB → soft-fail (NO 500) ─────────────────────────────────────
  it("error de DB → soft-fail: 200 con existingIds=[...ids] y missingIds=[]", async () => {
    mockFindMany.mockRejectedValue(new Error("connection reset by peer"));

    const res = await GET(makeReq("?ids=10,20,30"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    // Degrada a "todos existen" para NO forzar eliminación en el caller
    expect(body.existingIds).toEqual([10, 20, 30]);
    expect(body.missingIds).toEqual([]);
  });

  it("error de DB también soft-failea para errores no-Error (string throw)", async () => {
    mockFindMany.mockRejectedValue("boom");

    const res = await GET(makeReq("?ids=7"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([7]);
    expect(body.missingIds).toEqual([]);
  });

  // ── 8: ids duplicados ───────────────────────────────────────────────────────
  it("?ids=1,1,2 no dedupe en el input — missingIds preserva duplicados del input", async () => {
    // La DB devuelve el 1 una sola vez (lo normal con `id IN (1,1,2)`)
    mockFindMany.mockResolvedValue([{ id: 1 }]);

    const res = await GET(makeReq("?ids=1,1,2"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    // existingIds viene del resultado de Prisma (1 solo)
    expect(body.existingIds).toEqual([1]);
    // missingIds = capped.filter(id => !foundSet.has(id)). capped=[1,1,2], 1 está,
    // queda [2]. El duplicado del 1 NO aparece como missing (porque sí existe).
    expect(body.missingIds).toEqual([2]);
  });

  // ── 9: trimming de espacios ─────────────────────────────────────────────────
  it("?ids=' 1 , 2 , 3 ' trimea espacios correctamente", async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    // Nota: el URL real tendría %20; NextRequest los decodifica.
    const res = await GET(makeReq("?ids=%201%20,%202%20,%203%20"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ExistsPayload;
    expect(body.existingIds).toEqual([1, 2, 3]);
    expect(body.missingIds).toEqual([]);

    const call = mockFindMany.mock.calls[0]![0] as { where: { id: { in: number[] } } };
    expect(call.where.id.in).toEqual([1, 2, 3]);
  });

  // ── 10: cache headers ───────────────────────────────────────────────────────
  it("responde con Cache-Control público (s-maxage=30, swr=60) en happy path", async () => {
    mockFindMany.mockResolvedValue([{ id: 1 }]);

    const res = await GET(makeReq("?ids=1"));
    expect(res.status).toBe(200);

    const cc = res.headers.get("cache-control");
    expect(cc).toBeTruthy();
    expect(cc).toContain("s-maxage=30");
    expect(cc).toContain("stale-while-revalidate=60");
  });

  it("el soft-fail path NO setea Cache-Control (no cachear errores)", async () => {
    mockFindMany.mockRejectedValue(new Error("db down"));

    const res = await GET(makeReq("?ids=1"));
    expect(res.status).toBe(200);

    const cc = res.headers.get("cache-control");
    // NextResponse.json sin opts puede no setear cache-control, o setearlo default.
    // Lo importante: no replica el header s-maxage=30 del happy path.
    if (cc) {
      expect(cc).not.toContain("s-maxage=30");
    }
  });
});
