/**
 * Ruta del candado de credenciales (app/api/superadmin/candado/route.ts):
 * 401 sin sesión · 403 sin CSRF · 400/422 reautenticación · 422 secreto errado ·
 * 423 bloqueado (auditado una vez) · 200 con la cookie del desbloqueo ·
 * «Olvidé mi candado» y DELETE con reautenticación (el fallido también se audita).
 *
 * El candado y su lógica son los reales; PlatformSetting va en memoria.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// vitest.setup.ts deja pasar todo CSRF: acá va el real (cookie csrf-token == header x-csrf-token).
vi.mock("@/lib/auth/csrf", async () => await vi.importActual<typeof import("@/lib/auth/csrf")>("@/lib/auth/csrf"));

const m = vi.hoisted(() => ({ tabla: new Map<string, unknown>(), requirePlatformAPI: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: m.requirePlatformAPI }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: m.audit }));
vi.mock("@/lib/db/admin-totp.db", () => ({ SuperadminTotpDB: { getByUsername: vi.fn(async () => null) } }));
vi.mock("@/lib/auth/totp-step-up", () => ({ requireTotpStepUp: vi.fn(async () => null) }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: {
    getFresco: vi.fn(async (k: string) => (m.tabla.has(k) ? structuredClone(m.tabla.get(k)) : null)),
    actualizar: vi.fn(async (k: string, cambio: (v: unknown) => Promise<{ valor?: unknown; resultado: unknown }>) => {
      const r = await cambio(m.tabla.has(k) ? structuredClone(m.tabla.get(k)) : null);
      if (r.valor !== undefined) m.tabla.set(k, structuredClone(r.valor));
      return r.resultado;
    }),
    delete: vi.fn(async (k: string) => void m.tabla.delete(k)),
  },
}));

import { GET, POST, DELETE } from "@/app/api/superadmin/candado/route";

const SA = "sa-ruta";
const CLAVE = "clave-del-superadmin-1";
const UA = "vitest-navegador";

function pedido(method: "GET" | "POST" | "DELETE", body?: unknown, { csrf = true, cookie = "" } = {}) {
  const headers: Record<string, string> = { "user-agent": UA, "content-type": "application/json" };
  const cookies = ["buleje-platform-sess=x", csrf ? "csrf-token=tok-csrf-123" : "", cookie].filter(Boolean).join("; ");
  headers.cookie = cookies;
  if (csrf) headers["x-csrf-token"] = "tok-csrf-123";
  return new NextRequest("http://localhost:3000/api/superadmin/candado", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const acciones = () => m.audit.mock.calls.map((c) => c[0] as string);

beforeAll(() => {
  process.env.AUTH_SECRET = "secreto-de-prueba-del-candado-32-bytes-xx";
  process.env.SUPERADMIN_USERNAME = SA;
  process.env.SUPERADMIN_PASSWORD = CLAVE;
});
beforeEach(() => {
  vi.clearAllMocks();
  m.tabla.clear();
  m.requirePlatformAPI.mockResolvedValue({ ok: true, username: SA });
  m.audit.mockResolvedValue(undefined);
});

describe("/api/superadmin/candado", () => {
  it("401 sin sesión de plataforma", async () => {
    m.requirePlatformAPI.mockResolvedValue(NextResponse.json({ error: "No autenticado" }, { status: 401 }));
    expect((await GET(pedido("GET"))).status).toBe(401);
    expect((await POST(pedido("POST", { accion: "verificar", secreto: "1234" }))).status).toBe(401);
  });

  it("403 sin CSRF, antes de tocar nada", async () => {
    const res = await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }, { csrf: false }));
    expect(res.status).toBe(403);
    expect(m.tabla.size).toBe(0);
  });

  it("configurar la primera vez exige la contraseña de superadmin", async () => {
    const sin = await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468" }));
    expect(sin.status).toBe(400);
    expect((await sin.json()).error).toBe("reauth_requerida");
    const mala = await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: "otra" } }));
    expect(mala.status).toBe(422);
    expect(acciones()).toContain("candado_reauth_fallida");
    expect(m.tabla.size).toBe(0);

    const ok = await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }));
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sa-candado-cred=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/superadmin/);
    expect(acciones()).toContain("candado_configurado");
    const estado = await (await GET(pedido("GET"))).json();
    expect(estado).toMatchObject({ configurado: true, tipo: "pin", totpActivo: false });
  }, 30_000);

  it("422 con el secreto errado, 423 al 5.º (auditado una vez), 200 con el correcto pasado el bloqueo no", async () => {
    await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }));
    m.audit.mockClear();
    const r1 = await POST(pedido("POST", { accion: "verificar", secreto: "0000" }));
    expect(r1.status).toBe(422);
    expect((await r1.json()).restantes).toBe(4);
    for (let i = 0; i < 3; i++) await POST(pedido("POST", { accion: "verificar", secreto: "x" }));
    const quinto = await POST(pedido("POST", { accion: "verificar", secreto: "x" }));
    expect(quinto.status).toBe(423);
    expect(quinto.headers.get("retry-after")).toBe("900");
    expect((await quinto.json()).message).toMatch(/15 minutos/);
    // Bloqueado: ni el correcto abre, y no se audita otro bloqueo.
    expect((await POST(pedido("POST", { accion: "verificar", secreto: "2468" }))).status).toBe(423);
    expect(acciones().filter((a) => a === "candado_bloqueado")).toHaveLength(1);
    expect(acciones().filter((a) => a === "candado_fallo")).toHaveLength(4);
  }, 30_000);

  it("200 al abrir: cookie del desbloqueo y auditoría", async () => {
    await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }));
    const res = await POST(pedido("POST", { accion: "verificar", secreto: "2468" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sa-candado-cred=[^;]+/);
    expect(acciones()).toContain("candado_desbloqueo");
  }, 30_000);

  it("«Olvidé mi candado»: con la contraseña lo cambia aunque esté bloqueado", async () => {
    await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }));
    for (let i = 0; i < 5; i++) await POST(pedido("POST", { accion: "verificar", secreto: "x" }));
    const sinClave = await POST(pedido("POST", { accion: "configurar", tipo: "patron", secreto: "7531" }));
    expect(sinClave.status).toBe(400);
    const res = await POST(pedido("POST", { accion: "configurar", tipo: "patron", secreto: "7531", reauth: { contrasena: CLAVE } }));
    expect(res.status).toBe(200);
    expect(acciones()).toContain("candado_recuperado");
    expect((await (await GET(pedido("GET"))).json()).tipo).toBe("patron");
  }, 30_000);

  it("DELETE exige reautenticar; el intento fallido queda auditado", async () => {
    await POST(pedido("POST", { accion: "configurar", tipo: "pin", secreto: "2468", reauth: { contrasena: CLAVE } }));
    const mal = await DELETE(pedido("DELETE", { reauth: { contrasena: "otra" } }));
    expect(mal.status).toBe(422);
    expect(acciones()).toContain("candado_borrado_fallido");
    expect(m.tabla.size).toBe(1);
    const bien = await DELETE(pedido("DELETE", { reauth: { contrasena: CLAVE } }));
    expect(bien.status).toBe(200);
    expect(await bien.json()).toMatchObject({ ok: true, habia: true });
    expect(m.tabla.size).toBe(0);
    expect(acciones()).toContain("candado_borrado");
  }, 30_000);
});
