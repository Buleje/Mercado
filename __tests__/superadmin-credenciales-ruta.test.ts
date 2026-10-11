/**
 * Rutas detrás del candado de credenciales del superadmin:
 *   GET  /api/superadmin/tenants/[slug]/credenciales   401 / 423 / 404 / 200 sin hashes
 *   POST /api/superadmin/tenants/[slug]/reset-password 423 sin candado, adminUserId de otra tienda = 404
 *   POST /api/superadmin/tenants/[slug]/credenciales/entrar 423 sin candado, delega con candado
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { csrfMock } from "./helpers/mocks";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/csrf", () => csrfMock());
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const m = vi.hoisted(() => ({
  requirePlatformAPI: vi.fn(),
  getPlatformSession: vi.fn(),
  desbloqueoVigente: vi.fn(),
  estadoCandado: vi.fn(),
  tiendaPorSlug: vi.fn(),
  usuarios: vi.fn(),
  ultimosIngresos: vi.fn(),
  adminPrincipal: vi.fn(),
  usuarioActivo: vi.fn(),
  ponerContrasenaTemporal: vi.fn(),
  audit: vi.fn(),
  totp: vi.fn(),
  suplantar: vi.fn(),
}));

vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: m.requirePlatformAPI }));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: m.getPlatformSession,
  PLATFORM_SESSION: { COOKIE_NAME: "buleje-platform-sess" },
}));
vi.mock("@/lib/superadmin/candado", () => ({
  desbloqueoVigente: m.desbloqueoVigente,
  estadoCandado: m.estadoCandado,
  totpActivo: vi.fn(async () => false),
}));
vi.mock("@/lib/db/superadmin-credenciales.db", () => ({
  SuperadminCredencialesDB: {
    tiendaPorSlug: m.tiendaPorSlug,
    usuarios: m.usuarios,
    ultimosIngresos: m.ultimosIngresos,
    adminPrincipal: m.adminPrincipal,
    usuarioActivo: m.usuarioActivo,
    ponerContrasenaTemporal: m.ponerContrasenaTemporal,
  },
}));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/auth/totp-step-up", () => ({ requireTotpStepUp: m.totp }));
vi.mock("@/lib/auth/security-alerts", () => ({ notifyTenantOwnerSecurity: vi.fn(async () => undefined) }));
vi.mock("@/app/api/superadmin/impersonate/route", () => ({ POST: m.suplantar }));

import { GET as credenciales } from "@/app/api/superadmin/tenants/[slug]/credenciales/route";
import { POST as resetPassword } from "@/app/api/superadmin/tenants/[slug]/reset-password/route";
import { POST as entrar } from "@/app/api/superadmin/tenants/[slug]/credenciales/entrar/route";

const TIENDA = {
  id: "t-musa",
  slug: "musa",
  name: "Musa",
  active: true,
  ownerEmail: "duena@musa.pe",
  ownerPhone: "+51 999 111 222",
  customDomain: null,
};
const USUARIOS = [
  { id: "u1", username: "musa", name: "Drucila", role: "owner", active: true, mustChangePassword: false, dobleFactor: true, createdAt: new Date("2026-10-01") },
  { id: "u2", username: "caja1", name: "", role: "cajero", active: true, mustChangePassword: true, dobleFactor: false, createdAt: new Date("2026-10-02") },
];
const params = (slug = "musa") => ({ params: Promise.resolve({ slug }) });
const pedido = (ruta: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost:3000${ruta}`, {
    method: init?.method ?? "GET",
    headers: { "user-agent": "vitest", "content-type": "application/json", cookie: "buleje-platform-sess=x" },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePlatformAPI.mockResolvedValue({ ok: true, username: "sa" });
  m.getPlatformSession.mockResolvedValue({ username: "sa" });
  m.desbloqueoVigente.mockResolvedValue({ vence: 1_900_000_000_000, estado: { configurado: true, tipo: "pin", bloqueadoHasta: null, version: "v" } });
  m.estadoCandado.mockResolvedValue({ configurado: true, tipo: "pin", bloqueadoHasta: null, version: "v" });
  m.tiendaPorSlug.mockResolvedValue(TIENDA);
  m.usuarios.mockResolvedValue(USUARIOS);
  m.ultimosIngresos.mockResolvedValue(new Map([["musa", new Date("2026-10-10T14:00:00Z")]]));
  m.audit.mockResolvedValue(undefined);
  m.totp.mockResolvedValue(null);
  m.ponerContrasenaTemporal.mockResolvedValue(1);
});

describe("GET credenciales", () => {
  it("401 sin sesión de plataforma (nunca 404)", async () => {
    m.requirePlatformAPI.mockResolvedValueOnce(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    const res = await credenciales(pedido("/api/superadmin/tenants/musa/credenciales"), params());
    expect(res.status).toBe(401);
    expect(m.tiendaPorSlug).not.toHaveBeenCalled();
  });

  it("423 con el candado cerrado: dice si está configurado y su tipo, sin datos de la tienda", async () => {
    m.desbloqueoVigente.mockResolvedValueOnce(null);
    m.estadoCandado.mockResolvedValueOnce({ configurado: false, tipo: null, bloqueadoHasta: null, version: null });
    const res = await credenciales(pedido("/api/superadmin/tenants/musa/credenciales"), params());
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "candado_cerrado", configurado: false, tipo: null, bloqueadoHasta: null, totpActivo: false });
    expect(m.tiendaPorSlug).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("404 con una tienda que no existe", async () => {
    m.tiendaPorSlug.mockResolvedValueOnce(null);
    const res = await credenciales(pedido("/api/superadmin/tenants/nada/credenciales"), params("nada"));
    expect(res.status).toBe(404);
  });

  it("200: usuarios con rol, correo del dueño en el principal, último ingreso; sin hashes; queda auditado", async () => {
    const res = await credenciales(pedido("/api/superadmin/tenants/musa/credenciales"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const d = await res.json();
    expect(d.usuarios).toHaveLength(2);
    expect(d.usuarios[0]).toMatchObject({ usuario: "musa", rol: "owner", correo: "duena@musa.pe", principal: true, dobleFactor: true, ultimoIngreso: "2026-10-10T14:00:00.000Z" });
    expect(d.usuarios[1]).toMatchObject({ usuario: "caja1", correo: null, debeCambiarContrasena: true, ultimoIngreso: null, principal: false });
    expect(d.ingreso.url).toMatch(/\/admin$/);
    expect(d.tipoCandado).toBe("pin");
    const texto = JSON.stringify(d);
    expect(texto).not.toMatch(/passwordHash|totpSecret|\$2[aby]\$/);
    expect(m.audit).toHaveBeenCalledWith("credenciales_ver", expect.stringContaining("musa"), expect.objectContaining({ tenantSlug: "musa" }), "sa");
  });
});

describe("POST reset-password", () => {
  it("423 sin candado abierto, antes de pedir el TOTP y sin tocar contraseñas", async () => {
    m.desbloqueoVigente.mockResolvedValueOnce(null);
    const res = await resetPassword(pedido("/api/superadmin/tenants/musa/reset-password", { method: "POST", body: { totpCode: "123456", adminUserId: "u2" } }), params());
    expect(res.status).toBe(423);
    expect(m.totp).not.toHaveBeenCalled();
    expect(m.ponerContrasenaTemporal).not.toHaveBeenCalled();
  });

  it("respeta el step-up TOTP (412 sin 2FA enrolado)", async () => {
    m.totp.mockResolvedValueOnce(NextResponse.json({ error: "totp_not_enrolled" }, { status: 412 }));
    const res = await resetPassword(pedido("/api/superadmin/tenants/musa/reset-password", { method: "POST", body: { totpCode: "123456" } }), params());
    expect(res.status).toBe(412);
    expect(m.ponerContrasenaTemporal).not.toHaveBeenCalled();
  });

  it("adminUserId de otra tienda → 404 y no escribe", async () => {
    m.usuarioActivo.mockResolvedValueOnce(null);
    const res = await resetPassword(pedido("/api/superadmin/tenants/musa/reset-password", { method: "POST", body: { totpCode: "123456", adminUserId: "u-ajeno" } }), params());
    expect(res.status).toBe(404);
    expect(m.usuarioActivo).toHaveBeenCalledWith("t-musa", "u-ajeno");
    expect(m.ponerContrasenaTemporal).not.toHaveBeenCalled();
  });

  it("con adminUserId genera la temporal para ESE usuario, con la tienda en el write", async () => {
    m.usuarioActivo.mockResolvedValueOnce({ id: "u2", username: "caja1" });
    const res = await resetPassword(pedido("/api/superadmin/tenants/musa/reset-password", { method: "POST", body: { totpCode: "123456", adminUserId: "u2" } }), params());
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d).toMatchObject({ ok: true, username: "caja1", adminUserId: "u2", mustChange: true });
    expect(d.tempPassword).toMatch(/^[A-Za-z0-9]{12}#7$/);
    const [tenantId, adminUserId, hash] = m.ponerContrasenaTemporal.mock.calls[0];
    expect([tenantId, adminUserId]).toEqual(["t-musa", "u2"]);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(JSON.stringify(d)).not.toContain(hash);
  }, 30_000);

  it("sin adminUserId toma el admin principal (comportamiento de antes)", async () => {
    m.adminPrincipal.mockResolvedValueOnce({ id: "u1", username: "musa" });
    const res = await resetPassword(pedido("/api/superadmin/tenants/musa/reset-password", { method: "POST", body: { totpCode: "123456" } }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).username).toBe("musa");
    expect(m.ponerContrasenaTemporal.mock.calls[0].slice(0, 2)).toEqual(["t-musa", "u1"]);
  }, 30_000);
});

describe("POST credenciales/entrar", () => {
  it("423 sin candado y no suplanta", async () => {
    m.desbloqueoVigente.mockResolvedValueOnce(null);
    const res = await entrar(pedido("/api/superadmin/tenants/musa/credenciales/entrar", { method: "POST", body: {} }), params());
    expect(res.status).toBe(423);
    expect(m.suplantar).not.toHaveBeenCalled();
  });

  it("slug inválido → 404 sin suplantar", async () => {
    const res = await entrar(pedido("/api/superadmin/tenants/x/credenciales/entrar", { method: "POST", body: {} }), params("../main"));
    expect(res.status).toBe(404);
    expect(m.suplantar).not.toHaveBeenCalled();
  });

  it("si la suplantación no da 200 (423 del candado, 404 tienda) no audita «credenciales_entrar»", async () => {
    m.suplantar.mockResolvedValueOnce(NextResponse.json({ error: "candado_cerrado" }, { status: 423 }));
    const res = await entrar(pedido("/api/superadmin/tenants/musa/credenciales/entrar", { method: "POST", body: {} }), params());
    expect(res.status).toBe(423);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("con candado: delega en la suplantación existente con el slug y audita tras el 200", async () => {
    m.suplantar.mockResolvedValueOnce(NextResponse.json({ ok: true, tenantSlug: "musa" }));
    const res = await entrar(pedido("/api/superadmin/tenants/musa/credenciales/entrar", { method: "POST", body: {} }), params());
    expect(res.status).toBe(200);
    expect(m.audit).toHaveBeenCalledWith("credenciales_entrar", expect.any(String), { tenantSlug: "musa" }, "sa");
    const delegado = m.suplantar.mock.calls[0][0] as NextRequest;
    expect(new URL(delegado.url).pathname).toBe("/api/superadmin/impersonate");
    expect(await delegado.json()).toEqual({ slug: "musa" });
    expect(delegado.headers.get("cookie")).toContain("buleje-platform-sess");
  });
});
