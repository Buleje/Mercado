/**
 * Tests — GET /api/marketplace/stores/check-slug.
 *
 * Cubre:
 *  1. Sin auth → 401 (delegado a requireAdmin).
 *  2. ?slug vacío → valid:false reason:"empty".
 *  3. Slug con mayúsculas / caracteres inválidos → valid:false reason:"invalid".
 *  4. Slug propio del tenant → available:true isOwn:true.
 *  5. Slug libre (no propio) → available:true isOwn:false.
 *  6. Slug ocupado por otro tenant → available:false + suggestions con sufijo numérico.
 *  7. Sugerencias paran al obtener 3.
 *  8. Slug en mayúsculas se normaliza a lowercase y se acepta.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin, mockFindFirst } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: { findFirst: mockFindFirst },
  },
}));

import { GET } from "@/app/api/marketplace/stores/check-slug/route";

function makeReq(slug: string | null): NextRequest {
  const url = slug === null
    ? "http://localhost/api/marketplace/stores/check-slug"
    : `http://localhost/api/marketplace/stores/check-slug?slug=${encodeURIComponent(slug)}`;
  return new NextRequest(new URL(url));
}

const authOk = { tenantId: "tenant-A", userId: "u1", role: "admin" } as never;

describe("GET /api/marketplace/stores/check-slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin sesión válida → 401 (proxied desde requireAdmin)", async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const res = await GET(makeReq("mi-bodega"));
    expect(res.status).toBe(401);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("?slug vacío → valid:false reason:'empty'", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    const res = await GET(makeReq(""));
    const body = (await res.json()) as { valid: boolean; available: boolean; reason: string };
    expect(body).toEqual({ valid: false, available: false, reason: "empty" });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("slug inválido (mayúsculas, símbolos) → reason:'invalid'", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    // El handler lowercasea — entonces para un "invalid" real probamos con símbolos no permitidos.
    const res = await GET(makeReq("mi_bodega!"));
    const body = (await res.json()) as { valid: boolean; reason: string; message?: string };
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("invalid");
    expect(body.message).toMatch(/minúsculas|guiones/i);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("slug demasiado corto (< 3 chars) → reason:'invalid'", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    const res = await GET(makeReq("ab"));
    const body = (await res.json()) as { valid: boolean; reason: string };
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("invalid");
  });

  it("slug que coincide con el slug del propio tenant → available:true isOwn:true", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    mockFindFirst.mockResolvedValueOnce({ id: "s1", slug: "mi-bodega" }); // tu propio store

    const res = await GET(makeReq("mi-bodega"));
    const body = (await res.json()) as { valid: boolean; available: boolean; isOwn: boolean };
    expect(body).toEqual({ valid: true, available: true, isOwn: true });
    // Solo se consulta tu propio store; no se hace la query de "taken"
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("slug libre (no propio, no ocupado) → available:true isOwn:false", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    mockFindFirst
      .mockResolvedValueOnce({ id: "s1", slug: "otra-bodega" }) // tu store tiene otro slug
      .mockResolvedValueOnce(null); // el slug pedido no existe

    const res = await GET(makeReq("nueva-tienda"));
    const body = (await res.json()) as { valid: boolean; available: boolean; isOwn: boolean };
    expect(body).toEqual({ valid: true, available: true, isOwn: false });
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("slug ocupado por otro tenant → available:false + 3 sugerencias", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    mockFindFirst
      .mockResolvedValueOnce({ id: "s1", slug: "otra" }) // tu store
      .mockResolvedValueOnce({ id: "sX" }) // "tienda" ya existe
      .mockResolvedValueOnce(null) // tienda-2 libre
      .mockResolvedValueOnce(null) // tienda-3 libre
      .mockResolvedValueOnce(null); // tienda-4 libre

    const res = await GET(makeReq("tienda"));
    const body = (await res.json()) as {
      valid: boolean; available: boolean; reason: string; suggestions: string[];
    };
    expect(body.available).toBe(false);
    expect(body.reason).toBe("taken");
    expect(body.suggestions).toEqual(["tienda-2", "tienda-3", "tienda-4"]);
  });

  it("sugerencias paran al obtener 3 (no consulta más slots)", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    mockFindFirst
      .mockResolvedValueOnce({ id: "s1", slug: "otra" }) // tu store
      .mockResolvedValueOnce({ id: "sX" }) // taken
      .mockResolvedValueOnce(null) // -2 libre
      .mockResolvedValueOnce(null) // -3 libre
      .mockResolvedValueOnce(null); // -4 libre

    await GET(makeReq("tienda"));
    // 1 (own) + 1 (taken check) + 3 (suggestions) = 5 max
    expect(mockFindFirst).toHaveBeenCalledTimes(5);
  });

  it("slug en MAYÚSCULAS se normaliza a lowercase y se acepta", async () => {
    mockRequireAdmin.mockResolvedValue(authOk);
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const res = await GET(makeReq("MI-BODEGA"));
    const body = (await res.json()) as { valid: boolean; available: boolean };
    expect(body.valid).toBe(true);
    expect(body.available).toBe(true);
  });
});
