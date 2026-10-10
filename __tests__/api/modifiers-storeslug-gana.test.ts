/**
 * GET /api/products/[id]/modifiers — `?storeSlug=` gana a la sesión de admin.
 *
 * 2026-10-10 (rediseño de la home): un admin logueado que miraba la home del
 * marketplace recibía 0 adicionales (se buscaban en SU negocio) y el «+» agregaba
 * el pollo sin abrir «Arma tu pedido». La sesión sigue ganándole al header.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const tryAdmin = vi.fn();
const resolveTenantSlugToId = vi.fn();
const resolveTenantSlug = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { productModifierGroup: { findMany } } }));
vi.mock("@/lib/require-admin", () => ({ tryAdmin, requireAdmin: vi.fn() }));
vi.mock("@/lib/resolve-tenant", () => ({ resolveTenantSlugToId, resolveTenantSlug }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

const { GET } = await import("@/app/api/products/[id]/modifiers/route");

function pedir(url: string, headers: Record<string, string> = {}) {
  return GET(new NextRequest(url, { headers }), { params: Promise.resolve({ id: "7" }) });
}

function tenantConsultado(): string | undefined {
  return findMany.mock.calls[0]?.[0]?.where?.tenantId;
}

describe("modifiers: de qué negocio salen los adicionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    resolveTenantSlugToId.mockResolvedValue("tenant-tienda");
    resolveTenantSlug.mockResolvedValue("tenant-header");
  });

  it("con ?storeSlug= y sesión de admin de otro negocio, manda la tienda del slug", async () => {
    tryAdmin.mockResolvedValue({ tenantId: "tenant-del-admin" });
    await pedir("http://localhost/api/products/7/modifiers?storeSlug=pollos");
    expect(resolveTenantSlugToId).toHaveBeenCalledWith("pollos");
    expect(tenantConsultado()).toBe("tenant-tienda");
  });

  it("sin ?storeSlug=, la sesión le sigue ganando al header", async () => {
    tryAdmin.mockResolvedValue({ tenantId: "tenant-del-admin" });
    await pedir("http://localhost/api/products/7/modifiers", { "x-tenant-id": "otro" });
    expect(tenantConsultado()).toBe("tenant-del-admin");
  });
});
