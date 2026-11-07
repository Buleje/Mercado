/**
 * ADR-457 §Excepciones — fija la semántica de `main` en la zona de peligro
 * (cart-context + middleware de tenant) ANTES y DESPUÉS de renombrar el
 * literal a los helpers de lib/tenancy. Si este archivo cambia de resultado
 * entre los dos commits, el renombre no era un renombre.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    getSessionPayload: vi.fn(async (token: string) => {
      try {
        return JSON.parse(Buffer.from(token.split(".")[0], "base64").toString("utf8"));
      } catch {
        return null;
      }
    }),
  };
});
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantSlugToId: vi.fn(async (slug: string) => slug),
}));

import { resolveTenantFromHost, resolveTenantMultiSource } from "@/lib/middleware/tenant";
import { DEFAULT_TENANT_ID } from "@/lib/middleware/constants";
import { CartProvider, useCart } from "@/contexts/cart-context";

function req(path: string, opts?: { host?: string; cookies?: Record<string, string> }) {
  const headers: Record<string, string> = { host: opts?.host ?? "localhost:3000" };
  if (opts?.cookies) {
    headers.cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}
const token = (p: object) => `${Buffer.from(JSON.stringify(p)).toString("base64")}.sig`;

describe("middleware/tenant — main", () => {
  it("DEFAULT_TENANT_ID sigue siendo 'main'", () => {
    expect(DEFAULT_TENANT_ID).toBe("main");
  });

  it("host localhost / vercel / tunel → main; subdominio → su slug", () => {
    expect(resolveTenantFromHost(req("/", { host: "localhost:3000" }))).toBe("main");
    expect(resolveTenantFromHost(req("/", { host: "demo.localhost:3000" }))).toBe("demo");
    expect(resolveTenantFromHost(req("/", { host: "x.vercel.app" }))).toBe("main");
    expect(resolveTenantFromHost(req("/", { host: "a.trycloudflare.com" }))).toBe("main");
  });

  it("base distinta de main se devuelve tal cual", async () => {
    expect(await resolveTenantMultiSource(req("/api/x"), "demo")).toBe("demo");
  });

  it("JWT con tenantId main NO gana; cookie active-tenant=main se ignora", async () => {
    const sess = token({ tenantId: "main", role: "owner" });
    const r = await resolveTenantMultiSource(
      req("/api/admin/x", { cookies: { "buleje-admin-sess": sess, "active-tenant": "main" } }),
      "main",
    );
    expect(r).toBe("main");
  });

  it("JWT con tenantId real gana sobre main", async () => {
    const sess = token({ tenantId: "cmabc123", role: "admin" });
    const r = await resolveTenantMultiSource(
      req("/api/admin/x", { cookies: { "buleje-admin-sess": sess } }),
      "main",
    );
    expect(r).toBe("cmabc123");
  });

  it("cookie active-tenant real + owner → impersona", async () => {
    const sess = token({ tenantId: "main", role: "owner" });
    const r = await resolveTenantMultiSource(
      req("/api/admin/x", { cookies: { "buleje-admin-sess": sess, "active-tenant": "cmzzz" } }),
      "main",
    );
    expect(r).toBe("cmzzz");
  });
});

describe("cart-context — main = marketplace cross-store", () => {
  const wrapper = (slug: string) =>
    function W({ children }: { children: ReactNode }) {
      return <CartProvider tenantSlug={slug}>{children}</CartProvider>;
    };
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tenant real: pide los ids válidos del tenant", async () => {
    renderHook(() => useCart(), { wrapper: wrapper("demo") });
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/products?active=true")).toBe(true),
    );
  });

  it("main: NO pide ids del tenant (backend valida)", async () => {
    renderHook(() => useCart(), { wrapper: wrapper("main") });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === "/api/products?active=true")).toBe(false);
  });

  it("al hidratar con carrito guardado: main no manda tenantSlug a check-exists; tenant real sí", async () => {
    const item = { id: 7, name: "x", category: "c", price: 1, image: "/i", unit: "u", quantity: 1 };
    for (const [slug, espera] of [["main", false], ["demo", true]] as const) {
      localStorage.clear();
      fetchSpy.mockClear();
      localStorage.setItem(`buleje-${slug}-cart`, JSON.stringify([item]));
      renderHook(() => useCart(), { wrapper: wrapper(slug) });
      await new Promise((r) => setTimeout(r, 80));
      const checks = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("check-exists"));
      expect(checks.length).toBeGreaterThan(0);
      for (const u of checks) expect(u.includes("tenantSlug=")).toBe(espera);
    }
  });
});
