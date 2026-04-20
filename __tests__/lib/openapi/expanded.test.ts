/**
 * __tests__/lib/openapi/expanded.test.ts
 *
 * Verifica que las 10 registrations nuevas se generan correctamente
 * y que el documento OpenAPI 3.1 tiene la estructura esperada.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateOpenAPIDoc } from "../../../lib/openapi/generator";

// Generamos el documento una sola vez para todos los tests
let doc: ReturnType<typeof generateOpenAPIDoc>;

beforeAll(() => {
  doc = generateOpenAPIDoc();
});

// ── 1. El generador no lanza errores ─────────────────────────────────────────
describe("generación sin errores", () => {
  it("generateOpenAPIDoc() no lanza", () => {
    expect(() => generateOpenAPIDoc()).not.toThrow();
  });

  it("documento es serializable a JSON", () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it("openapi version es 3.1.0", () => {
    expect(doc.openapi).toBe("3.1.0");
  });
});

// ── 2. Las 10 paths nuevas están registradas ──────────────────────────────────
describe("10 paths nuevas presentes", () => {
  const newPaths = [
    "/marketplace/qa/{productId}",
    "/marketplace/stores/{slug}/live-viewers",
    "/marketplace/stores/{slug}/phone",
    "/marketplace/coupons",
    "/admin/dashboard/aggregates",
    "/admin/stats",
    "/admin/today-summary",
    "/analytics/kpis",
    "/analytics/rfm",
    "/ai/status",
  ] as const;

  for (const path of newPaths) {
    it(`contiene path ${path}`, () => {
      expect(doc.paths).toHaveProperty(path);
    });
  }
});

// ── 3. Total de paths = 15 (5 originales + 10 nuevas) ────────────────────────
describe("conteo total de paths", () => {
  it("tiene exactamente 15 paths registradas", () => {
    expect(Object.keys(doc.paths!).length).toBe(15);
  });
});

// ── 4. Cada path nueva tiene response 200 (o 201) y 400 ──────────────────────
describe("respuestas 200/201 y 400 presentes en paths nuevas", () => {
  type OperationMap = Record<string, { responses?: Record<string, unknown> }>;

  function getAnyOperation(path: string): { responses?: Record<string, unknown> } | undefined {
    const entry = (doc.paths![path] as OperationMap) ?? {};
    return entry["get"] ?? entry["post"] ?? entry["put"] ?? entry["patch"] ?? entry["delete"];
  }

  const pathsWithSuccess: Array<{ path: string; code: string }> = [
    { path: "/marketplace/qa/{productId}",               code: "200" },
    { path: "/marketplace/stores/{slug}/live-viewers",   code: "200" },
    { path: "/marketplace/stores/{slug}/phone",          code: "200" },
    { path: "/marketplace/coupons",                      code: "200" },
    { path: "/admin/dashboard/aggregates",               code: "200" },
    { path: "/admin/stats",                              code: "200" },
    { path: "/admin/today-summary",                      code: "200" },
    { path: "/analytics/kpis",                           code: "200" },
    { path: "/analytics/rfm",                            code: "200" },
    { path: "/ai/status",                                code: "200" },
  ];

  for (const { path, code } of pathsWithSuccess) {
    it(`${path} → response ${code} definida`, () => {
      const op = getAnyOperation(path);
      expect(op).toBeDefined();
      expect(op!.responses).toHaveProperty(code);
    });
  }

  // 400 en todos los que tienen validación (excluir store-phone y ai/status que solo tienen 200)
  const pathsWith400 = [
    "/marketplace/qa/{productId}",
    "/marketplace/stores/{slug}/live-viewers",
    "/marketplace/coupons",
    "/analytics/rfm",
  ];

  for (const path of pathsWith400) {
    it(`${path} → response 400 definida`, () => {
      const op = getAnyOperation(path);
      expect(op!.responses).toHaveProperty("400");
    });
  }
});

// ── 5. Endpoints admin requieren BearerAuth ───────────────────────────────────
describe("endpoints admin tienen security BearerAuth", () => {
  const securedPaths: Array<{ path: string; method: string }> = [
    { path: "/admin/dashboard/aggregates", method: "get" },
    { path: "/admin/stats",                method: "get" },
    { path: "/admin/today-summary",        method: "get" },
    { path: "/analytics/kpis",             method: "get" },
    { path: "/analytics/rfm",              method: "get" },
  ];

  for (const { path, method } of securedPaths) {
    it(`${method.toUpperCase()} ${path} requiere BearerAuth`, () => {
      const op = (doc.paths![path] as Record<string, { security?: unknown[] }>)?.[method];
      expect(op).toBeDefined();
      expect(Array.isArray(op?.security)).toBe(true);
      expect(
        (op?.security as Record<string, unknown>[])?.some((s) => "BearerAuth" in s)
      ).toBe(true);
    });
  }
});

// ── 6. Endpoints públicos NO tienen security ──────────────────────────────────
describe("endpoints públicos sin security", () => {
  const publicEndpoints: Array<{ path: string; method: string }> = [
    { path: "/marketplace/qa/{productId}",              method: "get"  },
    { path: "/marketplace/stores/{slug}/live-viewers",  method: "get"  },
    { path: "/marketplace/stores/{slug}/phone",         method: "get"  },
    { path: "/ai/status",                               method: "get"  },
  ];

  for (const { path, method } of publicEndpoints) {
    it(`${method.toUpperCase()} ${path} es público (sin security o array vacío)`, () => {
      const op = (doc.paths![path] as Record<string, { security?: unknown[] }>)?.[method];
      expect(op).toBeDefined();
      const sec = op?.security;
      expect(!sec || (sec as unknown[]).length === 0).toBe(true);
    });
  }
});

// ── 7. Tags correctos por área ────────────────────────────────────────────────
describe("tags por área de negocio", () => {
  it("/admin/stats tiene tag Admin", () => {
    const tags = (doc.paths!["/admin/stats"] as Record<string, { tags?: string[] }>)?.get?.tags ?? [];
    expect(tags).toContain("Admin");
  });

  it("/analytics/kpis tiene tag Analytics", () => {
    const tags = (doc.paths!["/analytics/kpis"] as Record<string, { tags?: string[] }>)?.get?.tags ?? [];
    expect(tags).toContain("Analytics");
  });

  it("/analytics/rfm tiene tag Analytics", () => {
    const tags = (doc.paths!["/analytics/rfm"] as Record<string, { tags?: string[] }>)?.get?.tags ?? [];
    expect(tags).toContain("Analytics");
  });

  it("/ai/status tiene tag AI", () => {
    const tags = (doc.paths!["/ai/status"] as Record<string, { tags?: string[] }>)?.get?.tags ?? [];
    expect(tags).toContain("AI");
  });

  it("/marketplace/qa/{productId} tiene tag Marketplace", () => {
    const tags = (doc.paths!["/marketplace/qa/{productId}"] as Record<string, { tags?: string[] }>)?.get?.tags ?? [];
    expect(tags).toContain("Marketplace");
  });
});
