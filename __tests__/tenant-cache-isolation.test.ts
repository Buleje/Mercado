/**
 * Tests de regresión — aislamiento multi-tenant en cache cliente.
 *
 * Bug histórico: useAdminPrefetch + componentes admin cacheaban en
 * localStorage con keys globales sin tenant prefix. Cuando el superadmin
 * impersonaba un segundo tenant, la pestaña veía los datos del primero.
 *
 * Este test bloquea la regresión: cualquier cambio que rompa
 * `assertTenantOwnership()` debe fallarlo.
 *
 * Cubierto:
 *   1. Si el slug actual coincide con el owner, NO se borra cache
 *   2. Si el slug cambia, se borran TODAS las keys conocidas
 *   3. Las keys con prefix tenant (`xxx::slug`) se respetan
 *   4. Sin slug actual, no hace nada
 *   5. clearAllTenantCache borra exhaustivo
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTenantOwnership,
  clearAllTenantCache,
  getActiveTenantSlug,
  tenantCacheKey,
} from "@/lib/tenant-cache";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";

// Mock tryAdmin para tests del resolver
vi.mock("@/lib/require-admin", () => ({
  tryAdmin: vi.fn(),
}));
const { tryAdmin } = await import("@/lib/require-admin");

// Mock de localStorage en jsdom
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

const COOKIE_KEY = "active-tenant-slug";

function setCookie(slug: string | null): void {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => (slug ? `${COOKIE_KEY}=${slug}` : ""),
  });
}

beforeEach(() => {
  // Resetea localStorage para cada test
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tenant-cache.ts — getActiveTenantSlug", () => {
  it("lee el slug de la cookie", () => {
    setCookie("tienda-juan");
    expect(getActiveTenantSlug()).toBe("tienda-juan");
  });

  it("devuelve null si no hay cookie", () => {
    setCookie(null);
    expect(getActiveTenantSlug()).toBeNull();
  });

  it("decodifica caracteres especiales en el slug", () => {
    setCookie("bode%C3%B1a-mar%C3%ADa"); // bodeña-maría url-encoded
    expect(getActiveTenantSlug()).toBe("bodeña-maría");
  });
});

describe("tenant-cache.ts — clearAllTenantCache", () => {
  it("borra TODAS las keys cacheadas conocidas", () => {
    localStorage.setItem("poc-products-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("poc-suppliers-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("admin-customers-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("admin-sales-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("admin-dashboard-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("admin-goals-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("admin-recepciones-cache", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("poc-templates", JSON.stringify({ data: "tenant-a" }));
    localStorage.setItem("unrelated-key", "should-survive");

    const removed = clearAllTenantCache();

    expect(removed).toBeGreaterThanOrEqual(8);
    expect(localStorage.getItem("poc-products-cache")).toBeNull();
    expect(localStorage.getItem("admin-sales-cache")).toBeNull();
    expect(localStorage.getItem("poc-templates")).toBeNull();
    expect(localStorage.getItem("unrelated-key")).toBe("should-survive");
  });

  it("borra cualquier key con prefijo tenant-scoped", () => {
    localStorage.setItem("admin-recepciones-cache-extra", "x");
    localStorage.setItem("dashboard-data-context", "x");
    localStorage.setItem("buleje-admin-template", "x");

    clearAllTenantCache();

    expect(localStorage.getItem("admin-recepciones-cache-extra")).toBeNull();
    expect(localStorage.getItem("dashboard-data-context")).toBeNull();
    expect(localStorage.getItem("buleje-admin-template")).toBeNull();
  });

  it("preserva el OWNER_KEY interno", () => {
    localStorage.setItem("__tenant-cache-owner", "tenant-x");
    localStorage.setItem("admin-sales-cache", "data");

    clearAllTenantCache();

    expect(localStorage.getItem("__tenant-cache-owner")).toBe("tenant-x");
    expect(localStorage.getItem("admin-sales-cache")).toBeNull();
  });
});

describe("tenant-cache.ts — assertTenantOwnership", () => {
  it("NO limpia si el tenant actual coincide con el owner", () => {
    setCookie("tienda-juan");
    localStorage.setItem("__tenant-cache-owner", "tienda-juan");
    localStorage.setItem("admin-sales-cache", "datos-sensibles");

    const changed = assertTenantOwnership();

    expect(changed).toBe(false);
    expect(localStorage.getItem("admin-sales-cache")).toBe("datos-sensibles");
  });

  it("LIMPIA cache si cambia el tenant", () => {
    setCookie("tenant-b");
    localStorage.setItem("__tenant-cache-owner", "tenant-a");
    localStorage.setItem("poc-products-cache", "data-de-tenant-a");
    localStorage.setItem("admin-sales-cache", "ventas-de-tenant-a");

    const changed = assertTenantOwnership();

    expect(changed).toBe(true);
    expect(localStorage.getItem("poc-products-cache")).toBeNull();
    expect(localStorage.getItem("admin-sales-cache")).toBeNull();
    expect(localStorage.getItem("__tenant-cache-owner")).toBe("tenant-b");
  });

  it("PRIMERA VEZ (sin owner previo) — actualiza owner y limpia cache stale", () => {
    setCookie("tenant-nuevo");
    localStorage.setItem("admin-sales-cache", "datos-anonimos");

    const changed = assertTenantOwnership();

    expect(changed).toBe(true);
    expect(localStorage.getItem("__tenant-cache-owner")).toBe("tenant-nuevo");
    expect(localStorage.getItem("admin-sales-cache")).toBeNull();
  });

  it("sin cookie no hace nada", () => {
    setCookie(null);
    localStorage.setItem("__tenant-cache-owner", "tenant-x");
    localStorage.setItem("admin-sales-cache", "datos");

    const changed = assertTenantOwnership();

    expect(changed).toBe(false);
    expect(localStorage.getItem("admin-sales-cache")).toBe("datos");
  });
});

describe("tenant-cache.ts — tenantCacheKey", () => {
  it("añade el slug como sufijo cuando hay tenant activo", () => {
    setCookie("tienda-pedro");
    expect(tenantCacheKey("my-cache")).toBe("my-cache::tienda-pedro");
  });

  it("devuelve la key sin prefix si no hay slug", () => {
    setCookie(null);
    expect(tenantCacheKey("my-cache")).toBe("my-cache");
  });
});

describe("resolve-tenant.ts — resolveTenantIdForRoute (server-side)", () => {
  function makeRequest(headers: Record<string, string>): { headers: Headers } {
    return { headers: new Headers(headers) } as never;
  }

  it("PRIORIDAD: JWT > header — admin autenticado en otro tenant ignora header stale", async () => {
    // Bug real: superadmin impersona tenant-B, pero el header x-tenant-id viene
    // como "main" por proxy stale. JWT debe ganar para evitar fuga de "main".
    vi.mocked(tryAdmin).mockResolvedValueOnce({
      tenantId: "cmnxxx-tenant-b",
      role: "admin",
      username: "superadmin",
      name: "SuperAdmin",
    } as never);
    const req = makeRequest({ "x-tenant-id": "main" });
    const tid = await resolveTenantIdForRoute(req as never);
    expect(tid).toBe("cmnxxx-tenant-b");
  });

  it("Fallback al header si no hay JWT (storefront anónimo)", async () => {
    vi.mocked(tryAdmin).mockResolvedValueOnce(null);
    const req = makeRequest({ "x-tenant-id": "tienda-juan" });
    const tid = await resolveTenantIdForRoute(req as never);
    expect(tid).toBe("tienda-juan");
  });

  it("Fallback final 'main' si no hay JWT ni header", async () => {
    vi.mocked(tryAdmin).mockResolvedValueOnce(null);
    const req = makeRequest({});
    const tid = await resolveTenantIdForRoute(req as never);
    expect(tid).toBe("main");
  });

  it("Admin con JWT pero sin header sigue funcionando", async () => {
    vi.mocked(tryAdmin).mockResolvedValueOnce({
      tenantId: "tenant-a",
      role: "admin",
      username: "owner",
      name: "Owner",
    } as never);
    const req = makeRequest({});
    const tid = await resolveTenantIdForRoute(req as never);
    expect(tid).toBe("tenant-a");
  });
});
