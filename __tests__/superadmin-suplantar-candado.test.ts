/**
 * Hallazgos de seguridad del candado (11-10):
 *  - ALTO-1  POST /api/superadmin/impersonate: con candado configurado y cerrado → 423, sin token ni auditoría.
 *  - MEDIO-3 POST /api/superadmin/tenants/[slug]/security: 423 antes del TOTP y sin tocar nada.
 *  - ALTO-2  POST /api/superadmin/settings: las claves `interno:*` se rechazan con 400 (una y en lote).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { csrfMock } from "./helpers/mocks";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/csrf", () => csrfMock());

const m = vi.hoisted(() => ({
  candado: vi.fn(),
  tenantFind: vi.fn(),
  token: vi.fn(),
  audit: vi.fn(),
  totp: vi.fn(),
  set: vi.fn(),
  setMany: vi.fn(),
}));
vi.mock("@/lib/superadmin/candado", () => ({ respuestaSiCandadoCerrado: m.candado }));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: vi.fn(async () => ({ username: "sa" })),
  PLATFORM_SESSION: { COOKIE_NAME: "buleje-platform-sess" },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: m.tenantFind },
    $queryRawUnsafe: vi.fn(async () => [{ username: "duena", totpEnabledAt: null }]),
    $executeRawUnsafe: vi.fn(async () => 1),
  },
}));
vi.mock("@/lib/session", () => ({
  createSessionToken: m.token,
  SESSION: { COOKIE_NAME: "buleje-admin-sess" },
  REFRESH: { COOKIE_NAME: "buleje-admin-refresh" },
  getRefreshPayload: vi.fn(async () => null),
}));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/auth/totp-step-up", () => ({ requireTotpStepUp: m.totp }));
vi.mock("@/lib/auth/session-revocation", () => ({ revokeSessionsBefore: vi.fn() }));
vi.mock("@/lib/auth/security-alerts", () => ({ notifyTenantOwnerSecurity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/trusted-devices.db", () => ({ TrustedDevicesDB: { revokeAll: vi.fn(async () => undefined) } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: { set: m.set, setMany: m.setMany, getAll: vi.fn(async () => ({})) },
}));

import { POST as suplantar } from "@/app/api/superadmin/impersonate/route";
import { POST as seguridad } from "@/app/api/superadmin/tenants/[slug]/security/route";
import { POST as ajustes } from "@/app/api/superadmin/settings/route";

const CERRADO = () => NextResponse.json({ error: "candado_cerrado" }, { status: 423 });
const pedido = (ruta: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest", cookie: "buleje-platform-sess=x" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.candado.mockReset().mockResolvedValue(null);
  m.tenantFind.mockResolvedValue({ id: "t-musa", name: "Musa", slug: "musa" });
  m.token.mockResolvedValue("token-admin");
  m.audit.mockResolvedValue(undefined);
  m.totp.mockResolvedValue(null);
});

describe("ALTO-1: suplantar exige el candado si está configurado", () => {
  it("candado cerrado → 423, sin buscar la tienda, sin auditoría y sin cookie de sesión", async () => {
    m.candado.mockResolvedValueOnce(CERRADO());
    const res = await suplantar(pedido("/api/superadmin/impersonate", { slug: "musa" }));
    expect(res.status).toBe(423);
    expect(m.candado).toHaveBeenCalledWith(expect.anything(), "sa");
    expect(m.tenantFind).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.token).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sin candado configurado (o abierto) → como antes: 200, auditoría y sesión de 10 min", async () => {
    const res = await suplantar(pedido("/api/superadmin/impersonate", { slug: "musa" }));
    expect(res.status).toBe(200);
    expect(m.audit).toHaveBeenCalledWith("impersonate", expect.any(String), expect.objectContaining({ targetTenantSlug: "musa" }), "sa");
    expect(res.headers.get("set-cookie")).toMatch(/buleje-admin-sess=token-admin/);
    // El refresh de la sesión anterior (otro negocio) se borra: si no, el panel lo
    // rotaba al montar y la pestaña de la tienda quedaba con la sesión de main.
    expect(res.headers.getSetCookie().find((c) => c.startsWith("buleje-admin-refresh="))).toMatch(/Max-Age=0/);
    // El token vive 10 min, igual que su cookie (security 11-10).
    expect(m.token).toHaveBeenCalledWith("admin", "impersonated-by:sa", "t-musa", "SuperAdmin→musa", 600_000);
  });
});

describe("MEDIO-3: acciones de seguridad sobre una tienda", () => {
  it("candado cerrado → 423 antes de pedir el TOTP y sin tocar la cuenta", async () => {
    m.candado.mockResolvedValueOnce(CERRADO());
    const res = await seguridad(pedido("/api/superadmin/tenants/musa/security", { action: "reset-2fa", totpCode: "123456" }), {
      params: Promise.resolve({ slug: "musa" }),
    });
    expect(res.status).toBe(423);
    expect(m.totp).not.toHaveBeenCalled();
    expect(m.tenantFind).not.toHaveBeenCalled();
  });

  it("sin candado → sigue al TOTP como siempre", async () => {
    const res = await seguridad(pedido("/api/superadmin/tenants/musa/security", { action: "force-change", totpCode: "123456" }), {
      params: Promise.resolve({ slug: "musa" }),
    });
    expect(res.status).toBe(200);
    expect(m.totp).toHaveBeenCalled();
  });
});

describe("ALTO-2: Ajustes no escribe claves internas", () => {
  it("una clave interna → 400 y no escribe", async () => {
    const res = await ajustes(pedido("/api/superadmin/settings", { key: "interno:candado-credenciales:sa", value: { tipo: "pin" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("clave_interna");
    expect(m.set).not.toHaveBeenCalled();
  });

  it("en lote, una sola interna (aunque venga en mayúsculas) tumba el lote entero", async () => {
    const res = await ajustes(pedido("/api/superadmin/settings", { settings: { "brand.name": "Buleje", "INTERNO:candado-credenciales:sa": null } }));
    expect(res.status).toBe(400);
    expect(m.setMany).not.toHaveBeenCalled();
  });

  it("una clave normal se sigue guardando", async () => {
    const res = await ajustes(pedido("/api/superadmin/settings", { key: "maintenance-mode", value: false }));
    expect(res.status).toBe(200);
    expect(m.set).toHaveBeenCalledWith("maintenance-mode", false, "sa");
  });
});
