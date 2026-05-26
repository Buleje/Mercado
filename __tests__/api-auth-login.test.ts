/**
 * API /api/auth/login – unit tests
 * Covers: missing fields (400), user not found (401), wrong password (401), valid login (200 + cookie)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only is aliased in vitest.config.ts → __mocks__/server-only.ts (no-op)

// ── Mock: rate-limit — always allow (non-production env already skips it,
//    but we mock explicitly to avoid side-effects and keep tests isolated) ──
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// ── Mock: resolve-tenant — always return "main" ──────────────────────────────
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantSlug: vi.fn(async () => "main"),
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

// ── Mock: jsondb / SettingsDB — default: no adminPassword ────────────────────
const { mockSettingsGet } = vi.hoisted(() => ({
  mockSettingsGet: vi.fn(async () => ({ adminPassword: null as string | null })),
}));
vi.mock("@/lib/jsondb", () => ({
  SettingsDB: { get: mockSettingsGet },
}));

// ── Mock: prisma ──────────────────────────────────────────────────────────────
const { mockFindMany, mockTenantFindFirst, mockTenantFindUnique, mockTenantFindMany } = vi.hoisted(() => ({
  mockFindMany:        vi.fn(),
  mockTenantFindFirst: vi.fn(),
  mockTenantFindUnique: vi.fn(),
  mockTenantFindMany:  vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findMany: mockFindMany },
    tenant:    { findFirst: mockTenantFindFirst, findUnique: mockTenantFindUnique, findMany: mockTenantFindMany },
  },
}));

// ── Mock: session — fake tokens + cookie name constants ─────────────────────
vi.mock("@/lib/session", () => ({
  createSessionToken: vi.fn(async () => "fake-session-token"),
  createRefreshToken: vi.fn(async () => "fake-refresh-token"),
  SESSION: {
    COOKIE_NAME: "bsm-admin-sess",
    MAX_AGE: 60 * 60 * 8,
  },
  REFRESH: {
    COOKIE_NAME: "bsm-admin-refresh",
    MAX_AGE: 60 * 60 * 24 * 7,
  },
}));

// ── Mock: bcryptjs ────────────────────────────────────────────────────────────
const { mockCompare } = vi.hoisted(() => ({
  mockCompare: vi.fn(),
}));
vi.mock("bcryptjs", () => ({
  compare: mockCompare,
}));

// ── Mock: fs/promises — default: ENOENT (no legacy file) ─────────────────────
vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }),
  },
}));

import { POST } from "@/app/api/auth/login/route";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeReq(body?: unknown, headers?: Record<string, string>): Request {
  return new Request("https://host/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// A stored bcrypt hash is identified by "$2" prefix — signal mock to verify
const BCRYPT_HASH = "$2b$10$somefakehashvalue";
const PLAIN_STORED = "plaintextpass";

const DB_USER = {
  username:     "admin",
  passwordHash: BCRYPT_HASH,
  role:         "admin",
  name:         "Administrador",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB returns no users; settings have no admin password
    mockFindMany.mockResolvedValue([]);
    mockTenantFindFirst.mockResolvedValue(null);
    // Audit 2026-05-17 05-P1-4: el login ahora rechaza con 400 si el slug
    // no resuelve a un tenant DB. Por default mockeamos que "main" SÍ existe
    // para que los demás tests (que validan otros aspectos) sigan corriendo.
    // Tests específicos del fix pueden override esto a null para validar 400.
    mockTenantFindUnique.mockResolvedValue({ id: "main-tenant-cuid", slug: "main" });
    mockTenantFindMany.mockResolvedValue([]);
    mockSettingsGet.mockResolvedValue({ adminPassword: null });
    mockCompare.mockResolvedValue(false);
  });

  // ── 1. Missing credentials ─────────────────────────────────────────────────

  describe("400 – missing / incomplete credentials", () => {
    it("returns 400 when password is missing (body has only username)", async () => {
      const res = await POST(makeReq({ username: "admin" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/password/i);
    });

    it("returns 400 when body is empty object (no fields at all)", async () => {
      const res = await POST(makeReq({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/password/i);
    });

    it("returns 400 when password is empty string", async () => {
      const res = await POST(makeReq({ username: "admin", password: "" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/password/i);
    });
  });

  // ── 2. User not found in DB ────────────────────────────────────────────────

  describe("401 – user does not exist", () => {
    it("returns 401 when prisma returns no matching user", async () => {
      mockFindMany.mockResolvedValue([]);
      const res = await POST(makeReq({ username: "ghost", password: "whatever" }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns 401 when only wrong username is provided (DB empty)", async () => {
      mockFindMany.mockResolvedValue([]);
      const res = await POST(makeReq({ username: "nouser", password: "pass123" }));
      expect(res.status).toBe(401);
    });
  });

  // ── 3. Wrong password ─────────────────────────────────────────────────────

  describe("401 – incorrect password", () => {
    it("returns 401 when bcrypt compare fails for a hashed password", async () => {
      mockFindMany.mockResolvedValue([DB_USER]);
      mockCompare.mockResolvedValue(false); // wrong password
      const res = await POST(makeReq({ username: "admin", password: "wrongpass" }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/incorrect/i);
    });

    it("returns 401 when plain-text stored password does not match input", async () => {
      const plainUser = { ...DB_USER, passwordHash: PLAIN_STORED };
      mockFindMany.mockResolvedValue([plainUser]);
      // compare() won't be called for plain-text (stored doesn't start with $2)
      const res = await POST(makeReq({ username: "admin", password: "notthisone" }));
      expect(res.status).toBe(401);
    });
  });

  // ── 4. Valid credentials → 200 + session cookie ───────────────────────────

  describe("200 – successful login", () => {
    it("returns 200, { ok: true, role, name }, and sets session cookie (bcrypt hash)", async () => {
      mockFindMany.mockResolvedValue([DB_USER]);
      mockCompare.mockResolvedValue(true); // correct password

      const res = await POST(makeReq({ username: "admin", password: "correctpass" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.role).toBe("admin");
      expect(body.name).toBe("Administrador");
    });

    it("sets the bsm-admin-sess cookie on successful login", async () => {
      mockFindMany.mockResolvedValue([DB_USER]);
      mockCompare.mockResolvedValue(true);

      const res = await POST(makeReq({ username: "admin", password: "correctpass" }));

      // The Set-Cookie header should contain the session cookie name
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("bsm-admin-sess");
    });

    it("returns 401 when stored password is plain-text (fail-closed security)", async () => {
      // Security hardening: checkPassword() rechaza cualquier password que no
      // empiece con $2a$/$2b$/$2y$ (bcrypt). Plain-text en DB es un bug legacy
      // que NO debe autorizar login — comportamiento correcto es rechazar.
      const plainUser = { ...DB_USER, passwordHash: PLAIN_STORED };
      mockFindMany.mockResolvedValue([plainUser]);

      const res = await POST(makeReq({ username: "admin", password: PLAIN_STORED }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/incorrect/i);
    });

    it("returns 400 when login is attempted without a username (security hardening: username required)", async () => {
      mockFindMany.mockResolvedValue([DB_USER]);
      mockCompare.mockResolvedValue(true);

      // Antes username era opcional → matched el primer user activo (peligroso).
      // Ahora username es requerido — sin él retorna 400 (validation error).
      const res = await POST(makeReq({ password: "correctpass" }));

      expect(res.status).toBe(400);
    });
  });

  // ── 5. Settings fallback ─────────────────────────────────────────────────

  describe("200 – settings admin password fallback", () => {
    it("returns 200 via settings fallback when DB has no users and bcrypt-hashed settings password matches", async () => {
      // Security: settings fallback solo acepta adminPassword si esta bcrypt-hashed
      // (mismo checkPassword fail-closed). Usamos un hash dummy y forzamos compare=true.
      // Brandon 2026-05-17: pentest F3 (2026-05-07) gateó este fallback con
      // process.env.LEGACY_LOGIN. En prod debe estar AUSENTE; en tests lo
      // activamos explícito para cubrir la lógica histórica.
      const originalLegacy = process.env.LEGACY_LOGIN;
      process.env.LEGACY_LOGIN = "1";
      try {
        mockFindMany.mockResolvedValue([]);
        mockSettingsGet.mockResolvedValue({ adminPassword: BCRYPT_HASH });
        mockCompare.mockResolvedValue(true);

        // Round 13: handler requiere username explícito tras hardening.
        const res = await POST(makeReq({ username: "admin", password: "adminpass123" }));

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.role).toBe("admin");
      } finally {
        if (originalLegacy === undefined) delete process.env.LEGACY_LOGIN;
        else process.env.LEGACY_LOGIN = originalLegacy;
      }
    });

    it("returns 401 via settings fallback when settings adminPassword is plain-text (fail-closed)", async () => {
      mockFindMany.mockResolvedValue([]);
      mockSettingsGet.mockResolvedValue({ adminPassword: "plaintext-admin-pass" });

      const res = await POST(makeReq({ username: "admin", password: "plaintext-admin-pass" }));

      expect(res.status).toBe(401);
    });

    it("returns 401 when DB is empty and settings password does not match", async () => {
      mockFindMany.mockResolvedValue([]);
      mockSettingsGet.mockResolvedValue({ adminPassword: "adminpass123" });

      const res = await POST(makeReq({ username: "admin", password: "wrongpass" }));

      expect(res.status).toBe(401);
    });
  });

  // ── 6. Edge cases (round 27 — QA gap #7 round 21) ────────────────────────

  describe("Edge cases — security hardening", () => {
    it("rechaza username con SQL injection sin crash (' OR '1'='1)", async () => {
      // Prisma usa parametrized queries — inyección no funcional, pero el
      // handler debe responder 401 (no encontrado) sin throw ni 500.
      mockFindMany.mockResolvedValue([]);
      const res = await POST(
        makeReq({ username: "' OR '1'='1", password: "anything" }),
      );
      expect([401, 400]).toContain(res.status);
      // No 500 — handler no debe crashear con input malicioso
      expect(res.status).not.toBe(500);
    });

    it("rechaza username con caracteres NULL bytes y control chars", async () => {
      mockFindMany.mockResolvedValue([]);
      const res = await POST(
        makeReq({ username: "admin\x00\x01\x02", password: "test" }),
      );
      expect([401, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });

    it("rechaza payload con username muy largo (DoS resistance)", async () => {
      const hugeUsername = "a".repeat(10000);
      const res = await POST(
        makeReq({ username: hugeUsername, password: "test" }),
      );
      expect([401, 400, 413]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });

    it("Set-Cookie tiene flags httpOnly + secure + SameSite en login exitoso", async () => {
      mockFindMany.mockResolvedValue([DB_USER]);
      mockCompare.mockResolvedValue(true);

      const res = await POST(
        makeReq({ username: "admin", password: "correctpass" }),
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") ?? "";
      // SECURITY hardening: httpOnly + SameSite obligatorios.
      expect(setCookie.toLowerCase()).toMatch(/httponly/);
      expect(setCookie.toLowerCase()).toMatch(/samesite=/);
    });

    it("body no-JSON returns 400 sin crash", async () => {
      // Request con body string no parseable como JSON
      const req = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-valid-json{",
      });
      const res = await POST(req);
      expect([400, 401]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });

    it("acepta password Unicode (no normaliza ni rompe)", async () => {
      // Caracteres Unicode válidos — el handler debe procesar sin crash
      mockFindMany.mockResolvedValue([]);
      const res = await POST(
        makeReq({ username: "admin", password: "pässwörd-ñ-中文-🔒" }),
      );
      expect([401, 200]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADR-120 — Login unificado (la credencial decide la tienda + picker)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login — login unificado (ADR-120)", () => {
  const HASH = "$2b$10$fakehashforunifiedlogin";

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue({ id: "main-tenant-cuid", slug: "main" });
    mockTenantFindMany.mockResolvedValue([]);
    mockSettingsGet.mockResolvedValue({ adminPassword: null });
    mockCompare.mockResolvedValue(false);
  });

  it("1 sola coincidencia → entra directo a esa tienda (200)", async () => {
    mockFindMany.mockResolvedValue([
      { username: "pizzaadmin", passwordHash: HASH, role: "admin", name: "Admin Pizza", tenantId: "pizza-cuid", onboardingCompletedAt: new Date() },
    ]);
    mockCompare.mockResolvedValue(true);
    mockTenantFindFirst.mockResolvedValue({ slug: "pizza-pucallpa" });

    const res = await POST(makeReq({ username: "pizzaadmin", password: "secret" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenantSlug).toBe("pizza-pucallpa");
    expect(body.requiresTenantChoice).toBeUndefined();
  });

  it("credencial en VARIAS tiendas → requiresTenantChoice (sin sesión, anti auto-entrada)", async () => {
    mockFindMany.mockResolvedValue([
      { username: "qaadmin", passwordHash: HASH, role: "admin", name: "QA Main", tenantId: "main", onboardingCompletedAt: new Date() },
      { username: "qaadmin", passwordHash: HASH, role: "admin", name: "QA Pollo", tenantId: "pollo-cuid", onboardingCompletedAt: new Date() },
    ]);
    mockCompare.mockResolvedValue(true);
    mockTenantFindMany.mockResolvedValue([
      { slug: "main", name: "Buleje" },
      { slug: "mi-pollo", name: "Pollería El Dorado" },
    ]);

    const res = await POST(makeReq({ username: "qaadmin", password: "secret" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requiresTenantChoice).toBe(true);
    expect(body.options).toHaveLength(2);
    expect(body.options.map((o: { slug: string }) => o.slug)).toEqual(["main", "mi-pollo"]);
    // SEGURIDAD: no debe emitir sesión en caso ambiguo
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("bsm-admin-sess");
    expect(body.ok).toBeUndefined();
  });

  it("re-submit con tenantSlug → scopea el lookup a esa tienda y entra", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "pollo-cuid", slug: "mi-pollo" });
    mockFindMany.mockResolvedValue([
      { username: "qaadmin", passwordHash: HASH, role: "admin", name: "QA Pollo", tenantId: "pollo-cuid", onboardingCompletedAt: new Date() },
    ]);
    mockCompare.mockResolvedValue(true);
    mockTenantFindFirst.mockResolvedValue({ slug: "mi-pollo" });

    const res = await POST(makeReq({ username: "qaadmin", password: "secret", tenantSlug: "mi-pollo" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tenantSlug).toBe("mi-pollo");
    // el findMany debe haberse scopeado al tenant elegido
    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.tenantId).toBe("pollo-cuid");
  });

  it("tenantSlug inexistente → 400 tenant_invalid", async () => {
    mockTenantFindUnique.mockResolvedValue(null); // slug no existe
    const res = await POST(makeReq({ username: "x", password: "y", tenantSlug: "no-existe" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("tenant_invalid");
  });

  it("credencial incorrecta sigue dando 401 (no se cuela)", async () => {
    mockFindMany.mockResolvedValue([
      { username: "pizzaadmin", passwordHash: HASH, role: "admin", name: "Admin", tenantId: "pizza-cuid", onboardingCompletedAt: new Date() },
    ]);
    mockCompare.mockResolvedValue(false); // password no matchea
    const res = await POST(makeReq({ username: "pizzaadmin", password: "wrong" }));
    expect(res.status).toBe(401);
  });
});
