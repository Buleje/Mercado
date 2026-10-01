/**
 * API /api/auth/refresh – unit tests
 * Covers: no cookie (401), expired token (401), access token as refresh (401),
 *         successful rotation (200 + cookies), token validity, rate limiting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock: rate-limit — allow by default, controllable per test ───────────────
const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn<() => Response | null>(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mockApplyRateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// ── Mock: logger — swallow all log output ────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock: AdminUsersDB — el route valida que la cuenta siga activa vía
// AdminUsersDB.getByUsername (línea 99 del route), que sin DB queda colgado
// (el try/catch del route atrapa throws, NO un hang de conexión prisma) →
// timeout de 5s en los 6 tests del happy-path. Devolvemos un usuario activo
// para que la rotación proceda. Ningún test cubre el caso inactivo.
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: {
    getByUsername: vi.fn(async () => ({ active: true })),
  },
}));

// ── Use REAL session functions — we need actual token generation/verification ─
// No mock for @/lib/session — we import the real module.

import { POST } from "@/app/api/auth/refresh/route";
import {
  createSessionToken,
  createRefreshToken,
  getSessionPayload,
  getRefreshPayload,
  SESSION,
  REFRESH,
} from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReq(cookies?: Record<string, string>): NextRequest {
  const url = "https://host/api/auth/refresh";
  const req = new NextRequest(url, { method: "POST" });
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyRateLimit.mockReturnValue(null); // allow by default
  });

  // ── 1. No refresh cookie → 401 ────────────────────────────────────────────

  describe("401 – no refresh cookie", () => {
    it("returns 401 when no cookies are present", async () => {
      const res = await POST(makeReq());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/no refresh token/i);
    });

    it("returns 401 when only the access cookie is present (no refresh)", async () => {
      const accessToken = await createSessionToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [SESSION.COOKIE_NAME]: accessToken }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/no refresh token/i);
    });
  });

  // ── 2. Expired / invalid refresh token → 401 ─────────────────────────────

  describe("401 – expired or invalid refresh token", () => {
    it("returns 401 for a completely invalid (garbage) token", async () => {
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: "garbage.token.here" }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/expired/i);
    });

    it("returns 401 for a tampered refresh token (modified payload)", async () => {
      const validToken = await createRefreshToken("admin", "admin", "main", "Admin");
      // Tamper with the payload portion (before the last dot)
      const tampered = "AAAA" + validToken.slice(4);
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: tampered }));
      expect(res.status).toBe(401);
    });

    it("clears both cookies when refresh token is invalid", async () => {
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: "invalid" }));
      expect(res.status).toBe(401);
      // Check that Set-Cookie headers clear both cookies
      const setCookies = res.headers.getSetCookie();
      const sessionClear = setCookies.find((c: string) => c.includes(SESSION.COOKIE_NAME));
      const refreshClear = setCookies.find((c: string) => c.includes(REFRESH.COOKIE_NAME));
      expect(sessionClear).toBeDefined();
      expect(refreshClear).toBeDefined();
      // maxAge=0 means cookie is being cleared
      expect(sessionClear).toMatch(/Max-Age=0/i);
      expect(refreshClear).toMatch(/Max-Age=0/i);
    });
  });

  // ── 3. Access token used as refresh token → 401 ──────────────────────────

  describe("401 – access token used as refresh token", () => {
    it("rejects a valid access token presented as a refresh token", async () => {
      const accessToken = await createSessionToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: accessToken }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/expired/i);
    });
  });

  // ── 4. Successful token rotation → 200 + new cookies ─────────────────────

  describe("200 – successful token rotation", () => {
    it("returns 200 with ok:true and user info on valid refresh token", async () => {
      const refreshToken = await createRefreshToken("cajero", "maria", "tenant-1", "Maria");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.role).toBe("cajero");
      expect(body.username).toBe("maria");
      expect(body.tenantId).toBe("tenant-1");
    });

    it("sets new access token cookie in response", async () => {
      const refreshToken = await createRefreshToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      const accessCookie = setCookies.find((c: string) => c.includes(SESSION.COOKIE_NAME));
      expect(accessCookie).toBeDefined();
      expect(accessCookie).toContain("HttpOnly");
      expect(accessCookie).toContain("Path=/");
    });

    it("sets new refresh token cookie in response", async () => {
      const refreshToken = await createRefreshToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      const refreshCookie = setCookies.find((c: string) => c.includes(REFRESH.COOKIE_NAME));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("Path=/");
    });
  });

  // ── 5. New access token is valid via getSessionPayload ────────────────────

  describe("new access token validity", () => {
    it("new access token can be verified via getSessionPayload", async () => {
      const refreshToken = await createRefreshToken("almacenero", "carlos", "store-2", "Carlos");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      const accessCookie = setCookies.find((c: string) => c.includes(SESSION.COOKIE_NAME));
      expect(accessCookie).toBeDefined();

      // Extract token value from Set-Cookie header
      const tokenMatch = accessCookie!.match(new RegExp(`${SESSION.COOKIE_NAME}=([^;]+)`));
      expect(tokenMatch).toBeTruthy();
      const newAccessToken = decodeURIComponent(tokenMatch![1]);

      const payload = await getSessionPayload(newAccessToken);
      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("almacenero");
      expect(payload!.username).toBe("carlos");
      expect(payload!.tenantId).toBe("store-2");
    });
  });

  // ── 6. New refresh token is valid via getRefreshPayload ───────────────────

  describe("new refresh token validity", () => {
    it("new refresh token can be verified via getRefreshPayload", async () => {
      const refreshToken = await createRefreshToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      const refreshCookie = setCookies.find((c: string) => c.includes(REFRESH.COOKIE_NAME));
      expect(refreshCookie).toBeDefined();

      // Extract token value from Set-Cookie header
      const tokenMatch = refreshCookie!.match(new RegExp(`${REFRESH.COOKIE_NAME}=([^;]+)`));
      expect(tokenMatch).toBeTruthy();
      const newRefreshToken = decodeURIComponent(tokenMatch![1]);

      const payload = await getRefreshPayload(newRefreshToken);
      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("admin");
      expect(payload!.username).toBe("admin");
      expect(payload!.tenantId).toBe("main");
    });
  });

  // ── 7. Rate limiting (MODERATE preset) ────────────────────────────────────

  describe("rate limiting", () => {
    it("returns rate limit response when applyRateLimit triggers", async () => {
      const rateLimitRes = new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
      mockApplyRateLimit.mockReturnValue(rateLimitRes);

      const refreshToken = await createRefreshToken("admin", "admin", "main", "Admin");
      const res = await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toMatch(/too many/i);
    });

    it("calls applyRateLimit with MODERATE preset and auth:refresh prefix", async () => {
      const refreshToken = await createRefreshToken("admin", "admin", "main", "Admin");
      await POST(makeReq({ [REFRESH.COOKIE_NAME]: refreshToken }));

      expect(mockApplyRateLimit).toHaveBeenCalledTimes(1);
      expect(mockApplyRateLimit).toHaveBeenCalledWith(
        expect.anything(),  // the NextRequest
        "MODERATE",
        "auth:refresh"
      );
    });
  });
});
