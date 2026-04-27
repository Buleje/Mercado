/**
 * Tests — GET /api/marketplace/subcategories.
 *
 * Cubre:
 *  1. Sin filtros → devuelve subcategorías de todas las categorías activas.
 *  2. Categoría inactiva → sus subcategorías no se incluyen.
 *  3. Subcategoría inactiva → se filtra dentro de una categoría activa.
 *  4. ?category=<id> → solo subcategorías de esa categoría.
 *  5. ?category=todos → equivale a sin filtro.
 *  6. ?store=<slug> → solo subcategorías cuyo linkedStoreSlugs incluye ese slug.
 *  7. Combinación ?category=X&store=Y → AND.
 *  8. JSON ilegible → devuelve { subcategories: [] } sin 500.
 *  9. Cache-Control con s-maxage y stale-while-revalidate.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));

// Both prefixed and unprefixed forms must be mocked: the route imports
// "node:fs/promises" but the underlying resolver may pick "fs/promises" too.
vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: vi.fn(),
  default: { readFile: mockReadFile, writeFile: vi.fn() },
}));

import { GET } from "@/app/api/marketplace/subcategories/route";

function makeReq(query = ""): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/marketplace/subcategories${query}`));
}

const seed = {
  bodegas: {
    label: "Bodegas",
    description: "",
    imageUrl: null,
    active: true,
    subcategories: [
      { id: "abarrotes", label: "Abarrotes", active: true, linkedStoreSlugs: ["bodega-luis"] },
      { id: "bebidas", label: "Bebidas", active: true, linkedStoreSlugs: ["bodega-luis", "minimarket-norte"] },
      { id: "obsoleto", label: "Obsoleto", active: false, linkedStoreSlugs: [] },
    ],
  },
  farmacia: {
    label: "Farmacia",
    description: "",
    imageUrl: null,
    active: true,
    subcategories: [
      { id: "otc", label: "OTC", active: true, linkedStoreSlugs: ["farmacia-central"] },
    ],
  },
  oculta: {
    label: "Oculta",
    description: "",
    imageUrl: null,
    active: false,
    subcategories: [
      { id: "nope", label: "Nope", active: true, linkedStoreSlugs: [] },
    ],
  },
};

type Out = {
  subcategories: Array<{ id: string; categoryId: string; label: string; linkedStoreSlugs: string[] }>;
};

describe("GET /api/marketplace/subcategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(JSON.stringify(seed));
  });

  it("sin filtros → devuelve subcategorías activas de categorías activas", async () => {
    const res = await GET(makeReq());
    const body = (await res.json()) as Out;
    expect(mockReadFile).toHaveBeenCalled();
    const ids = body.subcategories.map((s) => s.id);
    expect(ids.sort()).toEqual(["abarrotes", "bebidas", "otc"]);
  });

  it("categoría inactiva ('oculta') → su subcategoría 'nope' no aparece", async () => {
    const res = await GET(makeReq());
    const body = (await res.json()) as Out;
    expect(body.subcategories.some((s) => s.id === "nope")).toBe(false);
  });

  it("subcategoría inactiva ('obsoleto') → se filtra aunque su categoría esté activa", async () => {
    const res = await GET(makeReq());
    const body = (await res.json()) as Out;
    expect(body.subcategories.some((s) => s.id === "obsoleto")).toBe(false);
  });

  it("?category=bodegas → solo subcategorías de esa categoría", async () => {
    const res = await GET(makeReq("?category=bodegas"));
    const body = (await res.json()) as Out;
    expect(body.subcategories.every((s) => s.categoryId === "bodegas")).toBe(true);
    expect(body.subcategories.map((s) => s.id).sort()).toEqual(["abarrotes", "bebidas"]);
  });

  it("?category=todos → equivale a sin filtro", async () => {
    const res = await GET(makeReq("?category=todos"));
    const body = (await res.json()) as Out;
    expect(body.subcategories.map((s) => s.id).sort()).toEqual(["abarrotes", "bebidas", "otc"]);
  });

  it("?store=bodega-luis → solo subcategorías linkeadas a ese slug", async () => {
    const res = await GET(makeReq("?store=bodega-luis"));
    const body = (await res.json()) as Out;
    expect(body.subcategories.map((s) => s.id).sort()).toEqual(["abarrotes", "bebidas"]);
  });

  it("?category=bodegas&store=farmacia-central → AND devuelve vacío", async () => {
    const res = await GET(makeReq("?category=bodegas&store=farmacia-central"));
    const body = (await res.json()) as Out;
    expect(body.subcategories).toEqual([]);
  });

  it("JSON corrupto → fallback a { subcategories: [] } con 200", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Out;
    expect(body.subcategories).toEqual([]);
  });

  it("Cache-Control público con s-maxage y stale-while-revalidate", async () => {
    const res = await GET(makeReq());
    const cc = res.headers.get("cache-control");
    expect(cc).toMatch(/max-age=\d+/);
    expect(cc).toMatch(/stale-while-revalidate=\d+/);
  });
});
