import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// SECURITY FIX P0 #2: resolveTenantMultiSource ahora verifica HMAC del JWT via
// getSessionPayload() antes de extraer tenantId. Los tests usan tokens fake
// (base64 payload + ".sig") que no pasan HMAC real — mockeamos
// getSessionPayload para decodificar el payload sin validacion HMAC, asi los
// tests siguen cubriendo la logica de prioridad de fuentes de tenant.
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    getSessionPayload: vi.fn(async (token: string) => {
      if (!token) return null;
      const [b64] = token.split(".");
      if (!b64) return null;
      try {
        return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      } catch {
        return null;
      }
    }),
  };
});

import { resolveTenantMultiSource } from "@/lib/middleware/tenant";

function makeReq(path: string, opts?: { headers?: Record<string, string>; cookies?: Record<string, string> }) {
  const headers: Record<string, string> = { host: "localhost:3000", ...(opts?.headers ?? {}) };
  if (opts?.cookies) {
    headers.cookie = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

function makeToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${encoded}.sig`;
}

describe("resolveTenantMultiSource", () => {
  it("JWT has highest priority — CUID wins over Referer slug and cookie", async () => {
    const req = makeReq("/api/products", {
      headers: { referer: "http://localhost:3000/t/demo/admin" },
      cookies: {
        "active-tenant": "foo",
        "buleje-admin-sess": makeToken({ tenantId: "tenant-cuid-123" }),
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    // JWT's CUID wins, NOT the Referer slug "demo"
    expect(tenant).toBe("tenant-cuid-123");
  });

  it("JWT CUID wins over stale active-tenant cookie", async () => {
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "demo",
        "buleje-admin-sess": makeToken({ tenantId: "tenant-cuid-123" }),
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-123");
  });

  it("supports legacy bsm-admin-sess cookie name", async () => {
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "demo",
        "bsm-admin-sess": makeToken({ tenantId: "tenant-cuid-legacy" }),
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-legacy");
  });

  it("active-tenant cookie sin JWT NO se honra (audit 2026-05-16 P2)", async () => {
    // SECURITY 2026-05-16: la cookie active-tenant solo se acepta cuando hay
    // JWT vigente Y role es owner/superadmin. Sin JWT, un atacante con XSS
    // podría setear la cookie y mover el tenant sin credenciales. Ahora cae
    // a baseTenant ("main") y la API igual retornará 401 si no auth.
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "tenant-cuid-from-cookie",
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("main");
  });

  it("falls back to Referer slug when no JWT and no cookie", async () => {
    const req = makeReq("/api/products", {
      headers: { referer: "http://localhost:3000/t/demo/tienda" },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("demo");
  });

  it("returns baseTenant when no sources available", async () => {
    const req = makeReq("/api/products");
    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("main");
  });

  it("skips JWT con tenantId='main' y usa cookie SI role permite impersonación", async () => {
    // SECURITY 2026-05-16: cookie active-tenant solo se honra cuando JWT
    // tiene role owner o superadmin (impersonación legítima).
    const req = makeReq("/api/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "main", role: "owner" }),
        "active-tenant": "tenant-cuid-456",
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-456");
  });

  it("JWT con tenantId='main' y role normal IGNORA la cookie", async () => {
    // Caso edge: usuario normal con JWT bootstrap. Cookie no se acepta para
    // impersonación. Ver L127-141 de lib/middleware/tenant.ts.
    const req = makeReq("/api/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "main", role: "admin" }),
        "active-tenant": "tenant-cuid-789",
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("main");
  });

  it("non-main baseTenant is returned immediately (subdomain resolution)", async () => {
    const req = makeReq("/api/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "jwt-cuid" }),
      },
    });

    const tenant = await resolveTenantMultiSource(req, "demo-subdomain");
    expect(tenant).toBe("demo-subdomain");
  });

  // FIX 2026-05-06: Source 0 (path /t/[slug]/) tiene prioridad sobre JWT.
  // Previene el bug donde un admin con JWT.tenantId stale veía datos del tenant
  // anterior al navegar a /t/otro-tenant/admin.
  it("Source 0: URL path /t/[slug]/ wins over JWT and cookie (anti-cross-tenant bug)", async () => {
    const req = makeReq("/t/mi-pollo/admin/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "main" }),
        "active-tenant": "main",
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    // Path explícito gana — admin no puede leer datos de "main" mientras está en /t/mi-pollo
    expect(tenant).toBe("mi-pollo");
  });

  it("Source 0: path /t/[slug]/ also wins over a healthy JWT pointing elsewhere", async () => {
    const req = makeReq("/t/tenant-A/admin", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "tenant-B-cuid" }),
      },
    });

    const tenant = await resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-A");
  });
});
