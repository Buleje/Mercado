import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
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
  it("JWT has highest priority — CUID wins over Referer slug and cookie", () => {
    const req = makeReq("/api/products", {
      headers: { referer: "http://localhost:3000/t/demo/admin" },
      cookies: {
        "active-tenant": "foo",
        "buleje-admin-sess": makeToken({ tenantId: "tenant-cuid-123" }),
      },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    // JWT's CUID wins, NOT the Referer slug "demo"
    expect(tenant).toBe("tenant-cuid-123");
  });

  it("JWT CUID wins over stale active-tenant cookie", () => {
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "demo",
        "buleje-admin-sess": makeToken({ tenantId: "tenant-cuid-123" }),
      },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-123");
  });

  it("supports legacy bsm-admin-sess cookie name", () => {
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "demo",
        "bsm-admin-sess": makeToken({ tenantId: "tenant-cuid-legacy" }),
      },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-legacy");
  });

  it("falls back to active-tenant cookie when no JWT", () => {
    const req = makeReq("/api/products", {
      cookies: {
        "active-tenant": "tenant-cuid-from-cookie",
      },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-from-cookie");
  });

  it("falls back to Referer slug when no JWT and no cookie", () => {
    const req = makeReq("/api/products", {
      headers: { referer: "http://localhost:3000/t/demo/tienda" },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("demo");
  });

  it("returns baseTenant when no sources available", () => {
    const req = makeReq("/api/products");
    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("main");
  });

  it("skips JWT with tenantId='main' and uses cookie", () => {
    const req = makeReq("/api/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "main" }),
        "active-tenant": "tenant-cuid-456",
      },
    });

    const tenant = resolveTenantMultiSource(req, "main");
    expect(tenant).toBe("tenant-cuid-456");
  });

  it("non-main baseTenant is returned immediately (subdomain resolution)", () => {
    const req = makeReq("/api/products", {
      cookies: {
        "buleje-admin-sess": makeToken({ tenantId: "jwt-cuid" }),
      },
    });

    const tenant = resolveTenantMultiSource(req, "demo-subdomain");
    expect(tenant).toBe("demo-subdomain");
  });
});
