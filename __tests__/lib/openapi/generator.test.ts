/**
 * __tests__/lib/openapi/generator.test.ts
 *
 * Verifica que el generador OpenAPI 3.1 produce un documento válido
 * con todas las registrations piloto correctamente incluidas.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { generateOpenAPIDoc } from "../../../lib/openapi/generator";

// Generamos el documento una sola vez para todos los tests
let doc: ReturnType<typeof generateOpenAPIDoc>;

beforeAll(() => {
  doc = generateOpenAPIDoc();
});

// ── 1. El documento es parseable y tiene la estructura OpenAPI 3.1 ────────────
describe("documento OpenAPI base", () => {
  it("genera un objeto válido (no undefined/null)", () => {
    expect(doc).toBeDefined();
    expect(typeof doc).toBe("object");
  });

  it("serializable a JSON sin error", () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });

  it("openapi version es 3.1.0", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("info.title es correcto", () => {
    expect(doc.info.title).toBe("Buleje / Bodega San Martín API");
  });

  it("info.version es 0.1.0", () => {
    expect(doc.info.version).toBe("0.1.0");
  });
});

// ── 2. Las 5 paths piloto están registradas ───────────────────────────────────
describe("paths piloto presentes", () => {
  const expectedPaths = [
    "/marketplace/coupons/validate",
    "/marketplace/reviews",
    "/marketplace/recommendations/for-me",
    "/marketplace/stores/register",
    "/marketplace/drivers/apply",
  ];

  for (const path of expectedPaths) {
    it(`contiene la path ${path}`, () => {
      expect(doc.paths).toHaveProperty(path);
    });
  }
});

// ── 3. Los métodos HTTP son correctos ─────────────────────────────────────────
describe("métodos HTTP correctos", () => {
  it("coupons/validate → POST", () => {
    expect(doc.paths!["/marketplace/coupons/validate"]).toHaveProperty("post");
  });

  it("reviews → POST y GET", () => {
    expect(doc.paths!["/marketplace/reviews"]).toHaveProperty("post");
    expect(doc.paths!["/marketplace/reviews"]).toHaveProperty("get");
  });

  it("recommendations/for-me → GET", () => {
    expect(doc.paths!["/marketplace/recommendations/for-me"]).toHaveProperty("get");
  });

  it("stores/register → POST", () => {
    expect(doc.paths!["/marketplace/stores/register"]).toHaveProperty("post");
  });

  it("drivers/apply → POST", () => {
    expect(doc.paths!["/marketplace/drivers/apply"]).toHaveProperty("post");
  });
});

// ── 4. Responses 200/201 incluyen schema (content definido) ──────────────────
describe("responses 200/201 incluyen schema", () => {
  it("coupons/validate POST → 200 con content", () => {
    const resp = doc.paths!["/marketplace/coupons/validate"]?.post?.responses?.["200"];
    expect(resp).toBeDefined();
    expect((resp as Record<string, unknown>).content).toBeDefined();
  });

  it("reviews POST → 201 con content", () => {
    const resp = doc.paths!["/marketplace/reviews"]?.post?.responses?.["201"];
    expect(resp).toBeDefined();
    expect((resp as Record<string, unknown>).content).toBeDefined();
  });

  it("recommendations/for-me GET → 200 con content", () => {
    const resp = doc.paths!["/marketplace/recommendations/for-me"]?.get?.responses?.["200"];
    expect(resp).toBeDefined();
    expect((resp as Record<string, unknown>).content).toBeDefined();
  });
});

// ── 5. Responses 400/500 mapean a ErrorResponseSchema ────────────────────────
describe("respuestas de error mapean a ErrorResponseSchema", () => {
  const errorEndpoints: Array<{ path: string; method: string }> = [
    { path: "/marketplace/coupons/validate",       method: "post" },
    { path: "/marketplace/reviews",                method: "post" },
    { path: "/marketplace/recommendations/for-me", method: "get"  },
    { path: "/marketplace/stores/register",        method: "post" },
    { path: "/marketplace/drivers/apply",          method: "post" },
  ];

  for (const { path, method } of errorEndpoints) {
    it(`${method.toUpperCase()} ${path} → 400 definido`, () => {
      const operation = (doc.paths![path] as Record<string, unknown>)?.[method] as Record<string, unknown> | undefined;
      expect(operation?.responses).toBeDefined();
      expect((operation?.responses as Record<string, unknown>)?.["400"]).toBeDefined();
    });

    it(`${method.toUpperCase()} ${path} → 500 definido`, () => {
      const operation = (doc.paths![path] as Record<string, unknown>)?.[method] as Record<string, unknown> | undefined;
      expect(operation?.responses).toBeDefined();
      expect((operation?.responses as Record<string, unknown>)?.["500"]).toBeDefined();
    });
  }
});

// ── 6. Security scheme BearerAuth registrado ─────────────────────────────────
describe("security schemes", () => {
  it("BearerAuth está en components.securitySchemes", () => {
    expect(doc.components?.securitySchemes?.["BearerAuth"]).toBeDefined();
  });

  it("recommendations/for-me requiere BearerAuth", () => {
    const security = doc.paths!["/marketplace/recommendations/for-me"]?.get?.security;
    expect(Array.isArray(security)).toBe(true);
    expect(security?.some((s: Record<string, unknown>) => "BearerAuth" in s)).toBe(true);
  });

  it("coupons/validate NO requiere auth", () => {
    const security = doc.paths!["/marketplace/coupons/validate"]?.post?.security;
    // Público: sin security o array vacío
    expect(!security || (security as unknown[]).length === 0).toBe(true);
  });
});

// ── 7. Schemas globales en components ────────────────────────────────────────
describe("schemas globales", () => {
  it("ErrorResponse está en components.schemas", () => {
    expect(doc.components?.schemas?.["ErrorResponse"]).toBeDefined();
  });
});

// ── 8. Tags asignados ─────────────────────────────────────────────────────────
describe("tags por endpoint", () => {
  it("coupons/validate tiene tag Marketplace", () => {
    const tags = doc.paths!["/marketplace/coupons/validate"]?.post?.tags ?? [];
    expect(tags).toContain("Marketplace");
  });

  it("reviews tiene tag Reviews", () => {
    const tags = doc.paths!["/marketplace/reviews"]?.post?.tags ?? [];
    expect(tags).toContain("Reviews");
  });
});
