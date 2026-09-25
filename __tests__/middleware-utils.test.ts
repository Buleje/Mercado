/**
 * __tests__/middleware-utils.test.ts
 *
 * Unit tests for lib/middleware-utils.ts:
 *   - generateRequestId
 *   - generateNonce
 *   - isProtectedAdmin
 *   - getIP
 *   - checkEdgeRateLimit
 *   - checkRateLimit
 *   - buildCSP
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  generateRequestId,
  generateNonce,
  isProtectedAdmin,
  getIP,
  checkEdgeRateLimit,
  checkRateLimit,
  buildCSP,
  rlStore,
  PUBLIC_ADMIN_PATHS,
  __resetEdgeLimiterForTests,
  type RateLimitEntry,
} from "@/lib/middleware-utils";
import { __resetDistributedRateLimitFallback } from "@/lib/rate-limit";

// Helper: crea un NextRequest mínimo con headers opcionales
function makeReq(url = "http://localhost:3000/", headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

// ── generateRequestId ─────────────────────────────────────────────────────────

describe("generateRequestId", () => {
  it("retorna un string no vacío", () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("tiene formato UUID válido cuando crypto.randomUUID está disponible", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(generateRequestId()).toMatch(uuidRegex);
  });

  it("dos llamadas consecutivas producen IDs diferentes", () => {
    expect(generateRequestId()).not.toBe(generateRequestId());
  });

  it("usa el fallback cuando crypto.randomUUID no está disponible", () => {
    const original = crypto.randomUUID;
    // Simular entorno sin randomUUID
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
  });
});

// ── generateNonce ──────────────────────────────────────────────────────────────

describe("generateNonce", () => {
  it("returns a non-empty string", () => {
    expect(generateNonce()).toBeTruthy();
    expect(typeof generateNonce()).toBe("string");
  });

  it("produces unique values on every call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  it("contains only base64url-safe characters (no +, /, =)", () => {
    const nonce = generateNonce();
    expect(nonce).not.toMatch(/[+/=]/);
  });

  it("is long enough to be secure (>= 16 chars)", () => {
    expect(generateNonce().length).toBeGreaterThanOrEqual(16);
  });
});

// ── isProtectedAdmin ───────────────────────────────────────────────────────────

describe("isProtectedAdmin", () => {
  it("returns true for /admin (root)", () => {
    expect(isProtectedAdmin("/admin")).toBe(true);
  });

  it("returns true for /admin/dashboard", () => {
    expect(isProtectedAdmin("/admin/dashboard")).toBe(true);
  });

  it("returns true for /admin/products/123", () => {
    expect(isProtectedAdmin("/admin/products/123")).toBe(true);
  });

  it("returns false for /admin/login (public)", () => {
    expect(isProtectedAdmin("/admin/login")).toBe(false);
  });

  it("returns false for /admin/setup (public)", () => {
    expect(isProtectedAdmin("/admin/setup")).toBe(false);
  });

  it("returns false for public store path", () => {
    expect(isProtectedAdmin("/tienda")).toBe(false);
  });

  it("returns false for API paths", () => {
    expect(isProtectedAdmin("/api/orders")).toBe(false);
  });

  it("PUBLIC_ADMIN_PATHS export matches tested paths", () => {
    expect(PUBLIC_ADMIN_PATHS).toContain("/admin/login");
    expect(PUBLIC_ADMIN_PATHS).toContain("/admin/setup");
  });
});

// ── checkEdgeRateLimit ────────────────────────────────────────────────────────

describe("checkEdgeRateLimit", () => {
  let map: Map<string, RateLimitEntry>;

  beforeEach(() => {
    map = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request from new IP", () => {
    expect(checkEdgeRateLimit(map, "1.2.3.4", 5, 60_000)).toBe(true);
  });

  it("allows up to maxRequests", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkEdgeRateLimit(map, "10.0.0.1", 5, 60_000)).toBe(true);
    }
  });

  it("blocks the (maxRequests+1)th request", () => {
    for (let i = 0; i < 5; i++) {
      checkEdgeRateLimit(map, "10.0.0.2", 5, 60_000);
    }
    expect(checkEdgeRateLimit(map, "10.0.0.2", 5, 60_000)).toBe(false);
  });

  it("resets count after window expires", () => {
    for (let i = 0; i < 5; i++) {
      checkEdgeRateLimit(map, "10.0.0.3", 5, 60_000);
    }
    // Advance past window
    vi.advanceTimersByTime(60_001);
    // Should be allowed again (window reset)
    expect(checkEdgeRateLimit(map, "10.0.0.3", 5, 60_000, Date.now())).toBe(true);
  });

  it("isolates different IPs independently", () => {
    for (let i = 0; i < 5; i++) {
      checkEdgeRateLimit(map, "192.168.1.1", 5, 60_000);
    }
    // IP B has not been rate-limited
    expect(checkEdgeRateLimit(map, "192.168.1.2", 5, 60_000)).toBe(true);
    // IP A is blocked
    expect(checkEdgeRateLimit(map, "192.168.1.1", 5, 60_000)).toBe(false);
  });
});

// ── getIP ──────────────────────────────────────────────────────────────────────

describe("getIP", () => {
  it("extrae el primer IP de x-forwarded-for con múltiples valores", () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 192.168.0.1" });
    expect(getIP(req)).toBe("203.0.113.1");
  });

  it("extrae IP de x-real-ip cuando no hay x-forwarded-for", () => {
    const req = makeReq("http://localhost/", { "x-real-ip": "198.51.100.5" });
    expect(getIP(req)).toBe("198.51.100.5");
  });

  it("retorna 'unknown' cuando no hay ningún header de IP", () => {
    const req = makeReq("http://localhost/");
    expect(getIP(req)).toBe("unknown");
  });

  it("x-forwarded-for tiene prioridad sobre x-real-ip", () => {
    const req = makeReq("http://localhost/", {
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    expect(getIP(req)).toBe("1.1.1.1");
  });

  it("elimina espacios del primer IP de x-forwarded-for", () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "  172.16.0.1  , 10.0.0.2" });
    expect(getIP(req)).toBe("172.16.0.1");
  });
});

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe("checkRateLimit (distributed — Upstash fallback path)", () => {
  // Tests run without UPSTASH_REDIS_REST_URL so the limiter transparently
  // uses the in-memory fallback from lib/rate-limit.ts. Behavior should be
  // observationally identical to the pre-ADR-022 implementation for a
  // single-process test runner.

  beforeEach(() => {
    rlStore.clear();
    __resetEdgeLimiterForTests();
    __resetDistributedRateLimitFallback();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("primera request de una IP nueva retorna null (permitida)", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.1.1.1" });
    expect(await checkRateLimit(req)).toBeNull();
  });

  it("request número 60 sigue siendo permitida", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.1.1.2" });
    for (let i = 0; i < 59; i++) await checkRateLimit(req);
    expect(await checkRateLimit(req)).toBeNull();
  });

  it("request número 61 retorna NextResponse con status 429", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.1.1.3" });
    for (let i = 0; i < 60; i++) await checkRateLimit(req);
    const result = await checkRateLimit(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("la response 429 incluye el header Retry-After", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.1.1.4" });
    for (let i = 0; i < 60; i++) await checkRateLimit(req);
    const result = await checkRateLimit(req);
    const retryAfter = result!.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("IPs diferentes no comparten contador", async () => {
    const reqA = makeReq("http://localhost/", { "x-forwarded-for": "10.2.0.1" });
    const reqB = makeReq("http://localhost/", { "x-forwarded-for": "10.2.0.2" });
    for (let i = 0; i < 60; i++) await checkRateLimit(reqA);
    // IP A bloqueada, IP B libre
    expect(await checkRateLimit(reqA)).not.toBeNull();
    expect(await checkRateLimit(reqB)).toBeNull();
  });

  it("después de que la ventana expira permite de nuevo", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.3.0.1" });
    for (let i = 0; i < 60; i++) await checkRateLimit(req);
    expect(await checkRateLimit(req)).not.toBeNull(); // bloqueada

    // Avanzar más de 60 segundos (ventana de 60_000 ms) — el fallback
    // detecta el resetAt en el pasado y abre una ventana nueva.
    vi.advanceTimersByTime(60_001);
    expect(await checkRateLimit(req)).toBeNull();
  });

  it("el cuerpo de la response 429 contiene mensaje de error en español", async () => {
    const req = makeReq("http://localhost/", { "x-forwarded-for": "10.4.0.1" });
    for (let i = 0; i < 60; i++) await checkRateLimit(req);
    const result = await checkRateLimit(req);
    const body = await result!.json();
    expect(body.error).toBeTruthy();
    expect(typeof body.error).toBe("string");
  });

  // Leer el drive (miniaturas + archivo servido + ficha) gasta muchas requests
  // baratas: con el techo general de 60/min, revisar una carpeta grande moría a
  // los pocos archivos y el 429 se dibujaba dentro del visor.
  it("GET del drive: la request 61 sigue permitida (cupo propio)", async () => {
    const req = makeReq("http://localhost/api/admin/documents/abc/raw", { "x-forwarded-for": "10.5.0.1" });
    for (let i = 0; i < 60; i++) await checkRateLimit(req);
    expect(await checkRateLimit(req)).toBeNull();
  });

  it("GET del drive: se corta igual al pasar su propio cupo", async () => {
    const req = makeReq("http://localhost/api/admin/documents/abc/raw", { "x-forwarded-for": "10.5.0.2" });
    for (let i = 0; i < 300; i++) await checkRateLimit(req);
    expect(await checkRateLimit(req)).not.toBeNull();
  });

  it("el cupo del drive NO se gasta desde el resto de la API", async () => {
    const drive = makeReq("http://localhost/api/admin/documents/abc/raw", { "x-forwarded-for": "10.5.0.3" });
    const otra = makeReq("http://localhost/api/orders", { "x-forwarded-for": "10.5.0.3" });
    for (let i = 0; i < 60; i++) await checkRateLimit(otra);
    expect(await checkRateLimit(otra)).not.toBeNull(); // el general sí se agotó
    expect(await checkRateLimit(drive)).toBeNull();    // el del drive sigue libre
  });
});

// ── buildCSP ──────────────────────────────────────────────────────────────────

describe("buildCSP", () => {
  it("contains default-src 'self'", () => {
    expect(buildCSP("/")).toContain("default-src 'self'");
  });

  it("without nonce: script-src contains unsafe-inline", () => {
    expect(buildCSP("/")).toContain("'unsafe-inline'");
  });

  it("with nonce in production: script-src contains nonce + strict-dynamic, NOT unsafe-inline", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const csp = buildCSP("/", "abc123");
      expect(csp).toContain("'nonce-abc123'");
      expect(csp).toContain("'strict-dynamic'");
      const scriptSrc = csp.split(";").find(d => d.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("with nonce in dev: script-src has unsafe-inline (HMR scripts inline sin nonce)", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const csp = buildCSP("/", "abc123");
      const scriptSrc = csp.split(";").find(d => d.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).toContain("'unsafe-inline'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("script-src always contains unsafe-eval (Next.js hydration)", () => {
    expect(buildCSP("/", "abc123")).toContain("'unsafe-eval'");
  });

  it("style-src always has unsafe-inline (Tailwind)", () => {
    expect(buildCSP("/", "abc123")).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("admin routes block frame-ancestors with 'none'", () => {
    expect(buildCSP("/admin/dashboard", "n")).toContain("frame-ancestors 'none'");
    expect(buildCSP("/superadmin/panel", "n")).toContain("frame-ancestors 'none'");
  });

  it("non-admin routes allow self in frame-ancestors", () => {
    expect(buildCSP("/tienda", "n")).toContain("frame-ancestors 'self'");
  });

  it("object-src is 'none'", () => {
    expect(buildCSP("/")).toContain("object-src 'none'");
  });

  // Sin frame-src explícito se hereda `default-src 'self'`, que no incluye
  // blob:, y la vista previa del drive (que arma un blob para poder leer el
  // status antes de mostrar el archivo) quedaba bloqueada por el navegador.
  it("frame-src allows blob: so the document preview can render", () => {
    const csp = buildCSP("/admin", "n");
    expect(csp).toContain("frame-src 'self' blob: data:");
  });

  it("includes upgrade-insecure-requests", () => {
    expect(buildCSP("/")).toContain("upgrade-insecure-requests");
  });
});
