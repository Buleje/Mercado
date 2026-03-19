/**
 * __tests__/middleware-utils.test.ts
 *
 * Unit tests for lib/middleware-utils.ts:
 *   - generateNonce
 *   - isProtectedAdmin
 *   - checkEdgeRateLimit
 *   - buildCSP
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  generateNonce,
  isProtectedAdmin,
  checkEdgeRateLimit,
  buildCSP,
  PUBLIC_ADMIN_PATHS,
  type RateLimitEntry,
} from "@/lib/middleware-utils";

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

// ── buildCSP ──────────────────────────────────────────────────────────────────

describe("buildCSP", () => {
  it("contains default-src 'self'", () => {
    expect(buildCSP("/")).toContain("default-src 'self'");
  });

  it("without nonce: script-src contains unsafe-inline", () => {
    expect(buildCSP("/")).toContain("'unsafe-inline'");
  });

  it("with nonce: script-src contains nonce and NOT unsafe-inline", () => {
    const csp = buildCSP("/", "abc123");
    expect(csp).toContain("'nonce-abc123'");
    // Only the script-src directive should drop unsafe-inline; style-src keeps it for Tailwind
    const scriptSrc = csp.split(";").find(d => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("with nonce: still contains unsafe-eval (Next.js hydration)", () => {
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

  it("includes upgrade-insecure-requests", () => {
    expect(buildCSP("/")).toContain("upgrade-insecure-requests");
  });
});
