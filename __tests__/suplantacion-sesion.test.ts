/**
 * Sesión de suplantación del superadmin (security 11-10):
 *  1. «Salir» (/api/superadmin/impersonate/exit) ANULA el token, no sólo borra la cookie.
 *  2. Una suplantación cerrada (logout o salir) ya no se confirma en /api/auth/refresh: 401.
 *  3. El token vence a los 10 min, igual que su cookie; /api/auth/me lo informa para la franja.
 *  4. El refresh ajeno que se borra al confirmar la suplantación queda anulado en el servidor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null), getClientIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/admin-users.db", () => ({ AdminUsersDB: { getByUsername: vi.fn(async () => ({ active: true })) } }));

import { POST as salir } from "@/app/api/superadmin/impersonate/exit/route";
import { POST as renovar } from "@/app/api/auth/refresh/route";
import { POST as cerrarSesion } from "@/app/api/auth/logout/route";
import { GET as quienSoy } from "@/app/api/auth/me/route";
import { createSessionToken, createRefreshToken, getSessionPayload, vencimientoDeSesion, SESSION, REFRESH } from "@/lib/session";
import { DURACION_SUPLANTACION_S } from "@/lib/auth/suplantacion";
import { cacheStore } from "@/lib/cache";

const DIEZ_MIN = DURACION_SUPLANTACION_S * 1000;

function pedido(ruta: string, cookies: Record<string, string>, method = "POST"): NextRequest {
  const req = new NextRequest(`http://localhost:3000${ruta}`, { method });
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

const tokenSuplantacion = () => createSessionToken("admin", "impersonated-by:superadmin", "t-musa", "SuperAdmin→musa", DIEZ_MIN);

describe("suplantación: vida, salida y renovación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("3. el token de suplantación vence a los 10 min; el de una sesión normal sigue en 15", async () => {
    const antes = Date.now();
    const exp = await vencimientoDeSesion(await tokenSuplantacion());
    expect(exp).not.toBeNull();
    expect(exp! - antes).toBeGreaterThanOrEqual(DIEZ_MIN - 50);
    expect(exp! - antes).toBeLessThanOrEqual(DIEZ_MIN + 1000);
    const normal = await vencimientoDeSesion(await createSessionToken("admin", "duena", "t-musa", "Dueña"));
    expect(normal! - antes).toBeGreaterThanOrEqual(SESSION.MAX_AGE * 1000 - 50);
  });

  it("3. /api/auth/me informa el vencimiento sólo a la suplantación", async () => {
    const r1 = await quienSoy(pedido("/api/auth/me", { [SESSION.COOKIE_NAME]: await tokenSuplantacion() }, "GET"));
    const b1 = await r1.json();
    expect(b1.suplantacion.vence - Date.now()).toBeGreaterThan(DIEZ_MIN - 5000);
    expect(b1.suplantacion.vence - Date.now()).toBeLessThanOrEqual(DIEZ_MIN);
    const r2 = await quienSoy(pedido("/api/auth/me", { [SESSION.COOKIE_NAME]: await createSessionToken("admin", "duena", "t-musa", "Dueña") }, "GET"));
    expect((await r2.json()).suplantacion).toBeUndefined();
  });

  it("1. «Salir» anula el token (lista negra que mira requireAdmin) y la renovación da 401 después", async () => {
    const token = await tokenSuplantacion();
    const { jti } = (await getSessionPayload(token))!;
    expect(cacheStore.get(`revoked-access:${jti}`)).toBeFalsy();

    const res = await salir(pedido("/api/superadmin/impersonate/exit", { [SESSION.COOKIE_NAME]: token }));
    expect(res.status).toBe(200);
    expect(cacheStore.get(`revoked-access:${jti}`)).toBe(true);

    // Una copia del token guardada antes de salir ya no se confirma.
    const tras = await renovar(pedido("/api/auth/refresh", { [SESSION.COOKIE_NAME]: token }));
    expect(tras.status).toBe(401);
  });

  it("2. tras un logout, la renovación de la suplantación da 401 (antes 200 suplantacion:true)", async () => {
    const token = await tokenSuplantacion();
    expect((await renovar(pedido("/api/auth/refresh", { [SESSION.COOKIE_NAME]: token }))).status).toBe(200);
    expect((await cerrarSesion(pedido("/api/auth/logout", { [SESSION.COOKIE_NAME]: token }))).status).toBe(200);
    const tras = await renovar(pedido("/api/auth/refresh", { [SESSION.COOKIE_NAME]: token }));
    expect(tras.status).toBe(401);
    expect(tras.headers.getSetCookie().find((c) => c.startsWith(`${SESSION.COOKIE_NAME}=`))).toMatch(/Max-Age=0/);
  });

  it("4. el refresh ajeno que se borra al confirmar la suplantación ya no rota (anulado en el servidor)", async () => {
    const refreshDeMain = await createRefreshToken("admin", "qaadmin", "main", "QA Admin");
    const conf = await renovar(pedido("/api/auth/refresh", { [SESSION.COOKIE_NAME]: await tokenSuplantacion(), [REFRESH.COOKIE_NAME]: refreshDeMain }));
    expect(conf.status).toBe(200);
    // Una copia de ese refresh presentada sola: muerto, no da una sesión de main.
    const copia = await renovar(pedido("/api/auth/refresh", { [REFRESH.COOKIE_NAME]: refreshDeMain }));
    expect(copia.status).toBe(401);
  });
});
