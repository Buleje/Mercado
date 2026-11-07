/**
 * «+15 min» de la vista de tienda (18-10) y «salir del superadmin cierra las
 * vistas» (18-10):
 *  - POST /api/superadmin/impersonate/extender: sin sesión de plataforma → 401;
 *    vista de otro superadmin (o sesión real de la tienda) → 403; candado → 423;
 *    tope de 60 min por delante; anula el jti viejo; audita con los minutos.
 *  - DELETE /api/superadmin/auth: corta las vistas de ese superadmin y borra
 *    las cookies de la vista en este navegador (sólo si es una suplantación).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { csrfMock } from "./helpers/mocks";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/csrf", () => csrfMock());
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/superadmin-2fa", () => ({ is2FAEnabled: vi.fn(() => false), create2FAChallenge: vi.fn(), verify2FACode: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppQueued: vi.fn(async () => undefined) }));

const m = vi.hoisted(() => ({
  plataforma: vi.fn(),
  payload: vi.fn(),
  vence: vi.fn(),
  token: vi.fn(),
  candado: vi.fn(),
  audit: vi.fn(),
  tienda: vi.fn(),
}));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: m.plataforma,
  // «Salir» reconoce la sesión por la misma puerta (sin exigir actividad).
  superadminQueCierraSesion: vi.fn(async (token: string, ua: string | null) => (await m.plataforma(token, { ua }))?.username ?? null),
  createPlatformToken: vi.fn(),
  maybeRotateToken: vi.fn(),
  PLATFORM_SESSION: { COOKIE_NAME: "buleje-platform-sess", MAX_AGE: 28_800 },
}));
vi.mock("@/lib/session", () => ({
  createSessionToken: m.token,
  getSessionPayload: m.payload,
  vencimientoDeSesion: m.vence,
  SESSION: { COOKIE_NAME: "buleje-admin-sess", MAX_AGE: 900 },
}));
vi.mock("@/lib/superadmin/candado", () => ({ respuestaSiCandadoCerrado: m.candado }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: m.tienda } }));

import { POST as extender } from "@/app/api/superadmin/impersonate/extender/route";
import { DELETE as logoutSuperadmin } from "@/app/api/superadmin/auth/route";
import { cacheStore } from "@/lib/cache";
import { isSessionRevoked } from "@/lib/auth/session-revocation";

const MIN = 60_000;
const jtiEn = (ms: number) => `${ms.toString(36)}-abcd1234`;

let ahora = 0;
let jtiViejo = "";

const pedido = (metodo: "POST" | "DELETE", ruta: string, cookies = "buleje-platform-sess=p; buleje-admin-sess=vista") =>
  new NextRequest(`http://localhost:3000${ruta}`, {
    method: metodo,
    headers: { "user-agent": "vitest", cookie: cookies },
  });
const cookie = (res: Response, nombre: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${nombre}=`)) ?? "";

/** La vista viva: de «sa», en Musa, que vence en `quedanMin`. */
function vistaDe(superadmin: string, quedanMin: number) {
  m.payload.mockResolvedValue({
    role: "admin",
    username: `impersonated-by:${superadmin}`,
    tenantId: "t-musa",
    name: "SuperAdmin→musa",
    jti: jtiViejo,
  });
  m.vence.mockResolvedValue(ahora + quedanMin * MIN);
}

beforeEach(() => {
  vi.clearAllMocks();
  ahora = Date.now();
  // jti único por caso: la lista negra y los cortes viven en el cacheStore real.
  jtiViejo = `${(ahora - 5 * MIN).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  m.plataforma.mockResolvedValue({ username: "sa" });
  vistaDe("sa", 2);
  m.token.mockResolvedValue("token-nuevo");
  m.candado.mockResolvedValue(null);
  m.audit.mockResolvedValue(undefined);
  m.tienda.mockResolvedValue({ id: "t-musa", slug: "musa", name: "Musa" });
});

describe("POST /api/superadmin/impersonate/extender", () => {
  it("sin sesión de plataforma → 401, sin token ni auditoría", async () => {
    m.plataforma.mockResolvedValueOnce(null);
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(401);
    expect(m.token).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("la sesión de plataforma se valida atada al navegador (UA)", async () => {
    await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(m.plataforma).toHaveBeenCalledWith("p", { ua: "vitest" });
  });

  it("vista de OTRO superadmin → 403, sin token", async () => {
    vistaDe("otro-sa", 2);
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(403);
    expect(m.token).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("sesión real de la tienda (no es vista) → 403", async () => {
    m.payload.mockResolvedValue({ role: "admin", username: "duena", tenantId: "t-musa", jti: jtiViejo });
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(403);
    expect(m.token).not.toHaveBeenCalled();
  });

  it("sin cookie de vista (o vencida) → 401", async () => {
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender", "buleje-platform-sess=p"));
    expect(res.status).toBe(401);
    expect(m.token).not.toHaveBeenCalled();
  });

  it("vista ya anulada («Salir» / extendida antes) → 401", async () => {
    cacheStore.set(`revoked-access:${jtiViejo}`, true, 60);
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(401);
    expect(m.token).not.toHaveBeenCalled();
  });

  it("candado cerrado → 423, sin token ni auditoría", async () => {
    m.candado.mockResolvedValueOnce(NextResponse.json({ error: "candado_cerrado" }, { status: 423 }));
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(423);
    expect(m.candado).toHaveBeenCalledWith(expect.anything(), "sa");
    expect(m.token).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("quedan 2 min → +15: token de 17 min de la misma tienda, 3 cookies, jti viejo anulado, auditado", async () => {
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.minutos).toBe(15);
    expect(cuerpo.vence).toBe(ahora + 17 * MIN);
    expect(m.token).toHaveBeenCalledWith("admin", "impersonated-by:sa", "t-musa", "SuperAdmin→musa", expect.any(Number));
    const duracion = m.token.mock.calls[0][4] as number;
    expect(Math.abs(duracion - 17 * MIN)).toBeLessThan(2_000);
    for (const nombre of ["buleje-admin-sess", "active-tenant", "active-tenant-slug"]) {
      expect(cookie(res, nombre)).toMatch(/Max-Age=10(19|20)(;|$)/);
    }
    expect(cookie(res, "buleje-admin-sess")).toMatch(/^buleje-admin-sess=token-nuevo/);
    expect(cookie(res, "active-tenant-slug")).toMatch(/^active-tenant-slug=musa/);
    expect(cacheStore.get(`revoked-access:${jtiViejo}`)).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(
      "impersonate_extend",
      expect.stringContaining("alargó 15 min"),
      expect.objectContaining({ targetTenantId: "t-musa", minutos: 15, venceNuevo: new Date(ahora + 17 * MIN).toISOString() }),
      "sa",
    );
  });

  it("tope: con 50 min por delante suma 10, nunca más de 60 por delante", async () => {
    vistaDe("sa", 50);
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.minutos).toBe(10);
    expect(cuerpo.vence - Date.now()).toBeLessThanOrEqual(60 * MIN);
    expect(m.audit).toHaveBeenCalledWith("impersonate_extend", expect.any(String), expect.objectContaining({ minutos: 10 }), "sa");
  });

  it("ya en el tope (60 min por delante) → 422, sin token, sin auditoría y el jti viejo sigue", async () => {
    vistaDe("sa", 60);
    const res = await extender(pedido("POST", "/api/superadmin/impersonate/extender"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("tope_vista");
    expect(m.token).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    expect(cacheStore.get(`revoked-access:${jtiViejo}`)).toBeNull();
  });
});

describe("DELETE /api/superadmin/auth · salir cierra las vistas", () => {
  it("corta las vistas de ese superadmin emitidas antes; las de otro y los usuarios reales siguen", async () => {
    m.plataforma.mockResolvedValue({ username: "sa-logout" });
    m.payload.mockResolvedValue(null);
    const antes = jtiEn(Date.now() - MIN);
    const res = await logoutSuperadmin(pedido("DELETE", "/api/superadmin/auth", "buleje-platform-sess=p"));
    expect(res.status).toBe(200);
    expect(m.plataforma).toHaveBeenCalledWith("p", { ua: "vitest" });
    expect(isSessionRevoked(antes, "t-musa", "impersonated-by:sa-logout")).toBe(true);
    expect(isSessionRevoked(antes, "t-musa", "impersonated-by:otro-sa")).toBe(false);
    expect(isSessionRevoked(antes, "t-musa", "sa-logout")).toBe(false);
    // Una vista nueva (entrar de nuevo tras volver a iniciar sesión) vale.
    expect(isSessionRevoked(jtiEn(Date.now() + 1_000), "t-musa", "impersonated-by:sa-logout")).toBe(false);
  });

  it("con la vista abierta en este navegador: borra sus 3 cookies y anula su jti", async () => {
    const res = await logoutSuperadmin(pedido("DELETE", "/api/superadmin/auth"));
    expect(res.status).toBe(200);
    for (const nombre of ["buleje-platform-sess", "buleje-admin-sess", "active-tenant", "active-tenant-slug"]) {
      expect(cookie(res, nombre)).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
    }
    expect(cacheStore.get(`revoked-access:${jtiViejo}`)).toBe(true);
  });

  it("la sesión REAL de la tienda en este navegador no se toca", async () => {
    m.payload.mockResolvedValue({ role: "admin", username: "duena", tenantId: "t-musa", jti: jtiViejo });
    const res = await logoutSuperadmin(pedido("DELETE", "/api/superadmin/auth"));
    expect(cookie(res, "buleje-admin-sess")).toBe("");
    expect(cookie(res, "active-tenant")).toBe("");
    expect(cacheStore.get(`revoked-access:${jtiViejo}`)).toBeNull();
  });

  it("sesión de plataforma inválida (vencida u otro navegador): el corte sale del superadmin de la vista y la de este navegador se borra", async () => {
    m.plataforma.mockResolvedValue(null);
    vistaDe("sa-sin-sesion", 5);
    const res = await logoutSuperadmin(pedido("DELETE", "/api/superadmin/auth"));
    expect(cookie(res, "buleje-admin-sess")).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
    // Una copia de la vista en otro equipo también cae (security 18-10).
    expect(isSessionRevoked(jtiEn(Date.now() - MIN), "t-musa", "impersonated-by:sa-sin-sesion")).toBe(true);
    expect(isSessionRevoked(jtiEn(Date.now() - MIN), "t-musa", "impersonated-by:otro-sa")).toBe(false);
  });

  it("sin sesión de plataforma y sin vista en este navegador: no hay de quién cortar", async () => {
    m.plataforma.mockResolvedValue(null);
    m.payload.mockResolvedValue(null);
    const res = await logoutSuperadmin(pedido("DELETE", "/api/superadmin/auth", ""));
    expect(res.status).toBe(200);
    expect(isSessionRevoked(jtiEn(Date.now() - MIN), "t-musa", "impersonated-by:nadie")).toBe(false);
  });
});
