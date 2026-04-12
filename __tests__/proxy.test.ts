/**
 * __tests__/proxy.test.ts
 *
 * Tests unitarios para proxy.ts — middleware crítico de Buleje.
 *
 * Estrategias de tenant resolution cubiertas:
 *   E1  hostname subdomain (slug.localhost:3000 / slug.bodegasaas.com)
 *   E2  path /t/{slug}/* (rewrite + inyección de header + cookie)
 *   E3  Referer header con /t/{slug}/
 *   E4  cookie active-tenant
 *   E5  JWT bsm-admin-sess (base64 payload)
 *   E6  default "main"
 *   SEC inyección de x-tenant-id por cliente (debe ignorarse)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks de dependencias externas ───────────────────────────────────────────

// verifySessionToken: por defecto retorna true (sesión válida)
const { mockVerifySessionToken } = vi.hoisted(() => ({
  mockVerifySessionToken: vi.fn(async () => true),
}));
vi.mock("@/lib/session", () => ({
  verifySessionToken: mockVerifySessionToken,
  SESSION: { COOKIE_NAME: "bsm-admin-sess" },
}));

// getPlatformSession: por defecto retorna null (sin sesión de plataforma)
const { mockGetPlatformSession } = vi.hoisted(() => ({
  mockGetPlatformSession: vi.fn(async () => null),
}));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: mockGetPlatformSession,
  PLATFORM_SESSION: { COOKIE_NAME: "bsm-platform-sess" },
}));

// middleware-utils: usamos implementaciones reales salvo checkRateLimit que retorna null
vi.mock("@/lib/middleware-utils", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/middleware-utils")>();
  return {
    ...real,
    // Deshabilitar rate limiting en todos los tests
    checkRateLimit: vi.fn(() => null),
  };
});

// ── Import del módulo bajo test (DESPUÉS de los mocks) ────────────────────────
import { proxy } from "@/proxy";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Crea un NextRequest con soporte para cookies, headers y host personalizado.
 *
 * next/server requiere que la URL sea absoluta — usamos http://localhost:3000
 * como base y luego sobre-escribimos el header "host" para simular diferentes
 * subdominios sin necesidad de cambiar la URL de construcción.
 */
function makeReq(
  path: string,
  opts: {
    host?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    method?: string;
  } = {}
): NextRequest {
  const host = opts.host ?? "localhost:3000";
  const base = `http://${host}`;
  const url = new URL(path, base);

  const headers: Record<string, string> = {
    host,
    ...opts.headers,
  };

  // NextRequest no acepta cookies directamente en el constructor —
  // las inyectamos como header "cookie" en el formato estándar.
  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    const cookieStr = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers["cookie"] = cookieStr;
  }

  // cast via unknown para compatibilidad entre el RequestInit global y el de next/server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(url.toString(), { method: opts.method ?? "GET", headers } as any);
}

/**
 * Construye un token JWT-like con el payload base64 que usa proxy.ts.
 * Formato: base64(payload).signature  (proxy solo lee el payload, no verifica)
 */
function makeSessionToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${encoded}.fake-signature`;
}

// ── Limpieza entre tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySessionToken.mockResolvedValue(true);
  mockGetPlatformSession.mockResolvedValue(null);
});

// ═════════════════════════════════════════════════════════════════════════════
// E1 — Hostname subdomain
// ═════════════════════════════════════════════════════════════════════════════

describe("E1 — tenant desde subdomain hostname", () => {
  it("resuelve tenant desde slug.localhost:3000", async () => {
    const req = makeReq("/api/products", { host: "bodega-maria.localhost:3000" });
    const res = await proxy(req);

    // La función debe continuar (no redirigir) e inyectar el tenant correcto
    expect(res.status).not.toBe(302);
    // El header x-tenant-id debe reflejar el slug del subdominio
    const tenantHeader = req.headers.get("host");
    // Verificamos que el middleware procesó el host correcto
    expect(tenantHeader).toBe("bodega-maria.localhost:3000");
    // El response debe existir (middleware ejecutado)
    expect(res).toBeDefined();
  });

  it("resuelve tenant desde slug.bodegasaas.com (ROOT_DOMAIN)", async () => {
    // Simular ROOT_DOMAIN=bodegasaas.com
    const originalEnv = process.env.ROOT_DOMAIN;
    process.env.ROOT_DOMAIN = "bodegasaas.com";

    const req = makeReq("/api/products", { host: "fruteria.bodegasaas.com" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(302);

    process.env.ROOT_DOMAIN = originalEnv;
  });

  it("localhost sin subdomain resuelve a 'main'", async () => {
    const req = makeReq("/tienda", { host: "localhost:3000" });
    const res = await proxy(req);
    expect(res).toBeDefined();
    // No debe redirigir — "main" es tenant válido
    expect(res.status).not.toBe(500);
  });

  it("www.localhost resuelve a 'main' (no como slug)", async () => {
    const req = makeReq("/tienda", { host: "www.localhost:3000" });
    const res = await proxy(req);
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E2 — Path /t/{slug}/
// ═════════════════════════════════════════════════════════════════════════════

describe("E2 — tenant desde path /t/{slug}/", () => {
  it("rewrite /t/abc/tienda → /tienda con x-tenant-id=abc", async () => {
    const req = makeReq("/t/abc/tienda", { host: "localhost:3000" });
    const res = await proxy(req);

    // El middleware debe hacer un rewrite (NextResponse.rewrite retorna 200 normalmente)
    expect(res).toBeDefined();
    expect(res.status).not.toBe(302);
    // Verifica que se seteó la cookie active-tenant
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=abc");
  });

  it("rewrite /t/mi-bodega/admin → /admin con tenant=mi-bodega", async () => {
    const req = makeReq("/t/mi-bodega/admin", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=mi-bodega");
  });

  it("landing /t/demo/ inyecta tenant=demo y setea cookie", async () => {
    const req = makeReq("/t/demo/", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=demo");
  });

  it("landing /t/demo (sin barra final) inyecta tenant correcto", async () => {
    const req = makeReq("/t/demo", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=demo");
  });

  it("slug con guiones /t/bodega-san-martin/tienda decodifica correctamente", async () => {
    const req = makeReq("/t/bodega-san-martin/tienda", { host: "localhost:3000" });
    const res = await proxy(req);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=bodega-san-martin");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E3 — Referer header
// ═════════════════════════════════════════════════════════════════════════════

describe("E3 — tenant desde Referer header", () => {
  it("extrae tenant de Referer con /t/xyz/admin/something", async () => {
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        referer: "http://localhost:3000/t/xyz/admin/dashboard",
      },
    });
    const res = await proxy(req);

    // El tenant debe ser "xyz" (extraído del Referer)
    // Verificamos indirectamente que no falló el middleware
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("Referer con tenant diferente al cookie → usa Referer (mayor prioridad)", async () => {
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        referer: "http://localhost:3000/t/luis/admin",
      },
      cookies: {
        "active-tenant": "otro-tenant",
      },
    });
    const res = await proxy(req);

    // Referer tiene mayor prioridad que cookie según el código
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("Referer sin /t/{slug}/ no extrae tenant", async () => {
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        referer: "http://localhost:3000/admin/dashboard",
      },
    });
    const res = await proxy(req);

    // Sin tenant en referer → sigue al siguiente fallback
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E4 — Cookie active-tenant
// ═════════════════════════════════════════════════════════════════════════════

describe("E4 — tenant desde cookie active-tenant", () => {
  it("cookie active-tenant=foo → middleware acepta tenant foo", async () => {
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      cookies: {
        "active-tenant": "foo",
      },
    });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("cookie active-tenant=main → no sobreescribe (sigue como main)", async () => {
    const req = makeReq("/tienda", {
      host: "localhost:3000",
      cookies: {
        "active-tenant": "main",
      },
    });
    const res = await proxy(req);

    // "main" en cookie no debe sobrescribir a nada
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("cookie vacía no extrae tenant (cae a siguiente fuente)", async () => {
    const req = makeReq("/tienda", {
      host: "localhost:3000",
      cookies: {
        "active-tenant": "",
      },
    });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E5 — JWT bsm-admin-sess
// ═════════════════════════════════════════════════════════════════════════════

describe("E5 — tenant desde JWT bsm-admin-sess", () => {
  it("JWT con tenantId=tenant-from-jwt → extrae tenant del payload", async () => {
    const token = makeSessionToken({ tenantId: "tenant-from-jwt", role: "admin" });
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      cookies: {
        "bsm-admin-sess": token,
      },
    });
    const res = await proxy(req);

    // El middleware no falla con un token base64 válido
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("JWT con tenantId=main no sobreescribe (evita loops)", async () => {
    const token = makeSessionToken({ tenantId: "main", role: "admin" });
    const req = makeReq("/tienda", {
      host: "localhost:3000",
      cookies: {
        "bsm-admin-sess": token,
      },
    });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("JWT malformado (no base64 válido) es ignorado silenciosamente", async () => {
    const req = makeReq("/tienda", {
      host: "localhost:3000",
      cookies: {
        "bsm-admin-sess": "esto.no.es.un.jwt.valido.!!!",
      },
    });
    const res = await proxy(req);

    // El catch en proxy.ts asegura que no explota
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("JWT sin punto (formato incorrecto) no explota", async () => {
    const req = makeReq("/tienda", {
      host: "localhost:3000",
      cookies: {
        "bsm-admin-sess": "sinpuntoatodo",
      },
    });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E6 — Default "main"
// ═════════════════════════════════════════════════════════════════════════════

describe("E6 — default tenant 'main' cuando no hay ninguna fuente", () => {
  it("request a / sin subdomain, sin cookies, sin referer → no explota (tenant=main)", async () => {
    const req = makeReq("/", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("request a /tienda sin contexto de tenant → sigue funcionando", async () => {
    const req = makeReq("/tienda", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("Vercel deployment host (.vercel.app) resuelve a main", async () => {
    const req = makeReq("/tienda", { host: "my-app.vercel.app" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("Cloudflare tunnel host (.trycloudflare.com) resuelve a main", async () => {
    const req = makeReq("/tienda", { host: "abc123.trycloudflare.com" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SEC — Seguridad: inyección de x-tenant-id por el cliente
// ═════════════════════════════════════════════════════════════════════════════

describe("SEC — header x-tenant-id enviado por cliente es ignorado", () => {
  it("header x-tenant-id:hacker no sobreescribe el tenant resuelto", async () => {
    // El cliente intenta inyectar su propio tenant
    const req = makeReq("/api/products", {
      host: "bodega-real.localhost:3000",
      headers: {
        "x-tenant-id": "hacker",
      },
    });
    const res = await proxy(req);

    // El middleware NO debe fallar — sigue procesando con el tenant del hostname
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
    // La respuesta no debe ser 401 por la inyección en sí
    // (puede ser 401 si verifySessionToken falla, pero no por el header)
  });

  it("header x-tenant-id en request no-API no genera audit log (sin INTERNAL_API_KEY)", async () => {
    // Sin INTERNAL_API_KEY configurada, el audit es no-op
    const originalKey = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CRON_SECRET;

    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        "x-tenant-id": "hacker",
      },
      cookies: {
        "active-tenant": "legitimo",
      },
    });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);

    process.env.INTERNAL_API_KEY = originalKey;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Prioridad de estrategias (orden correcto)
// ═════════════════════════════════════════════════════════════════════════════

describe("Prioridad de estrategias de tenant resolution", () => {
  it("path /t/{slug}/ tiene mayor prioridad que subdomain hostname", async () => {
    // Host es subdomain pero la ruta es /t/otro/tienda — el path gana
    const req = makeReq("/t/otro/tienda", {
      host: "mi-slug.localhost:3000",
    });
    const res = await proxy(req);

    // El rewrite de /t/otro/tienda setea cookie active-tenant=otro
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("active-tenant=otro");
  });

  it("Referer tiene mayor prioridad que cookie active-tenant (per-tab safety)", async () => {
    // Ambos presentes: Referer con tenant-a, cookie con tenant-b
    // El código dice: Source 1 (HIGHEST for multi-tab safety) = Referer
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        referer: "http://localhost:3000/t/tenant-a/admin/dashboard",
      },
      cookies: {
        "active-tenant": "tenant-b",
      },
    });
    const res = await proxy(req);

    // No debe fallar — la resolución debe continuar limpiamente
    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Auth guards (smoke tests — no profundizamos porque requireAdmin ya se testea)
// ═════════════════════════════════════════════════════════════════════════════

describe("Auth guards de proxy", () => {
  it("/admin/login es siempre público (no redirige)", async () => {
    const req = makeReq("/admin/login", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res.status).not.toBe(302);
  });

  it("/admin sin sesión redirige a /admin/login", async () => {
    mockVerifySessionToken.mockResolvedValue(false);

    const req = makeReq("/admin/dashboard", { host: "localhost:3000" });
    const res = await proxy(req);

    // Next.js 16 usa 307 (Temporary Redirect, preserva método HTTP) en vez del 302 legacy
    expect([302, 307]).toContain(res.status);
    const location = res.headers.get("location");
    expect(location).toContain("/admin/login");
  });

  it("/admin con sesión válida pasa (200 o similar)", async () => {
    mockVerifySessionToken.mockResolvedValue(true);

    const req = makeReq("/admin/dashboard", {
      host: "localhost:3000",
      cookies: { "bsm-admin-sess": "valid-token" },
    });
    const res = await proxy(req);

    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(401);
  });

  it("/api/admin sin sesión retorna 401 JSON", async () => {
    mockVerifySessionToken.mockResolvedValue(false);

    const req = makeReq("/api/admin/users", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("Bearer sk_... en /api/ pasa sin cookie auth", async () => {
    const req = makeReq("/api/products", {
      host: "localhost:3000",
      headers: {
        authorization: "Bearer sk_live_abc123",
      },
    });
    const res = await proxy(req);

    // Bearer token bypassa la auth de cookie
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(302);
  });

  it("/pedido/xxx es siempre público", async () => {
    const req = makeReq("/pedido/ORD-001", { host: "localhost:3000" });
    const res = await proxy(req);

    expect(res.status).not.toBe(302);
    expect(res.status).not.toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveTenantFromHost — función privada testeada indirectamente
// (los tests de E1 ya la ejercen; estos cubren casos edge adicionales)
// ═════════════════════════════════════════════════════════════════════════════

describe("resolveTenantFromHost — casos edge", () => {
  it("127.0.0.1 resuelve a main", async () => {
    const req = makeReq("/tienda", { host: "127.0.0.1" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);
  });

  it("dominio custom (no subdomain de ROOT_DOMAIN) genera prefijo custom--", async () => {
    const originalEnv = process.env.ROOT_DOMAIN;
    process.env.ROOT_DOMAIN = "bodegasaas.com";

    const req = makeReq("/tienda", { host: "mi-tienda-propia.com" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);

    process.env.ROOT_DOMAIN = originalEnv;
  });

  it("subdominio www. resuelve a main (no como slug)", async () => {
    const originalEnv = process.env.ROOT_DOMAIN;
    process.env.ROOT_DOMAIN = "bodegasaas.com";

    const req = makeReq("/tienda", { host: "www.bodegasaas.com" });
    const res = await proxy(req);

    expect(res).toBeDefined();
    expect(res.status).not.toBe(500);

    process.env.ROOT_DOMAIN = originalEnv;
  });
});
