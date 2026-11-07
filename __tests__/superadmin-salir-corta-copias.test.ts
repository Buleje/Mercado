import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * «Salir» del superadmin corta las COPIAS de su sesión de plataforma (18-10,
 * Brandon: «sales a las 10:00 y la copia muere a las 10:00»). Firma, sesión,
 * corte y guardia del proxy son reales; sólo se apagan los efectos de afuera.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/superadmin-2fa", () => ({ is2FAEnabled: vi.fn(() => false), create2FAChallenge: vi.fn(), verify2FACode: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppQueued: vi.fn(async () => undefined) }));
vi.mock("@/lib/session", () => ({
  getSessionPayload: vi.fn(async () => null),
  verifySessionToken: vi.fn(async () => false),
  SESSION: { COOKIE_NAME: "buleje-admin-sess", MAX_AGE: 900 },
}));

import { DELETE as salir } from "@/app/api/superadmin/auth/route";
import { createPlatformToken, getPlatformSession, maybeRotateToken } from "@/lib/superadmin-session";
import { guardSuperadminApi } from "@/lib/middleware/auth-guards";

const UA = "Mozilla/5.0 (navegador del dueño)";
const MIN = 60_000;
let t0 = 0;
let n = 0;
/** Superadmin distinto por caso: el corte vive en el cacheStore real. */
let sa = "";

const pedidoSalir = (token: string, ua = UA) =>
  new NextRequest("http://localhost:3000/api/superadmin/auth", {
    method: "DELETE",
    headers: { "user-agent": ua, cookie: `buleje-platform-sess=${token}` },
  });

const avanzar = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeAll(() => {
  process.env.PLATFORM_AUTH_SECRET = "secreto-de-prueba-salir-corta-copias";
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  t0 = Date.UTC(2026, 9, 18, 15, 0, 0) + n * 10 * 60 * MIN;
  vi.setSystemTime(t0);
  n += 1;
  sa = `sa-salir-${n}`;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DELETE /api/superadmin/auth · las copias de la sesión dejan de servir", () => {
  it("la copia emitida antes del «Salir» da null; antes de salir valía", async () => {
    const token = await createPlatformToken(sa, UA);
    const copia = token;
    expect(await getPlatformSession(copia, { ua: UA })).not.toBeNull();
    avanzar(MIN);

    const res = await salir(pedidoSalir(token));
    expect(res.status).toBe(200);
    expect(await getPlatformSession(copia, { ua: UA })).toBeNull();
    // Las rutas que validan sin UA (requirePlatformAPI) también la rechazan.
    expect(await getPlatformSession(copia)).toBeNull();
  });

  it("login, «Salir» y login de nuevo en el MISMO milisegundo: la vieja cae y la nueva vale", async () => {
    const vieja = await createPlatformToken(sa, UA);
    await salir(pedidoSalir(vieja));
    const nueva = await createPlatformToken(sa, UA);

    expect(await getPlatformSession(vieja, { ua: UA })).toBeNull();
    const sesion = await getPlatformSession(nueva, { ua: UA });
    expect(sesion?.username).toBe(sa);
  });

  it("otro superadmin no se ve afectado", async () => {
    const otro = `${sa}-otro`;
    const delOtro = await createPlatformToken(otro, UA);
    const mio = await createPlatformToken(sa, UA);
    avanzar(MIN);

    await salir(pedidoSalir(mio));
    expect(await getPlatformSession(mio, { ua: UA })).toBeNull();
    expect((await getPlatformSession(delOtro, { ua: UA }))?.username).toBe(otro);
  });

  it("una copia rotada (mismo iat) sigue rechazada, y tras el corte ya no puede rotar", async () => {
    const token = await createPlatformToken(sa, UA);
    avanzar(6 * MIN);
    // Quien la copió la mantiene viva rotándola (lastSeen > 5 min → token nuevo).
    const rotada = await maybeRotateToken(token, { ua: UA });
    expect(rotada).not.toBeNull();
    expect(rotada).not.toBe(token);
    avanzar(MIN);

    await salir(pedidoSalir(token));
    expect(await getPlatformSession(rotada!, { ua: UA })).toBeNull();
    avanzar(6 * MIN);
    expect(await maybeRotateToken(rotada!, { ua: UA })).toBeNull();
  });

  it("pestaña del dueño dormida (+30 min): su «Salir» igual mata la copia que otro mantuvo viva", async () => {
    const delDueno = await createPlatformToken(sa, UA);
    avanzar(25 * MIN);
    const copiaViva = await maybeRotateToken(delDueno, { ua: UA });
    expect(copiaViva).not.toBeNull();
    avanzar(15 * MIN); // el del dueño lleva 40 min quieto; la copia, 15

    expect(await getPlatformSession(delDueno, { ua: UA })).toBeNull();
    expect(await getPlatformSession(copiaViva!, { ua: UA })).not.toBeNull();
    await salir(pedidoSalir(delDueno));
    expect(await getPlatformSession(copiaViva!, { ua: UA })).toBeNull();
  });

  it("una copia ya cortada no puede volver a cortar: el login nuevo del dueño sigue", async () => {
    const copia = await createPlatformToken(sa, UA);
    avanzar(MIN);
    await salir(pedidoSalir(copia));
    avanzar(MIN);
    const nueva = await createPlatformToken(sa, UA);
    avanzar(MIN);

    await salir(pedidoSalir(copia)); // quien tiene la copia aprieta «Salir»
    expect((await getPlatformSession(nueva, { ua: UA }))?.username).toBe(sa);
  });

  it("un «Salir» desde otro navegador (UA distinto) no corta nada", async () => {
    const token = await createPlatformToken(sa, UA);
    avanzar(MIN);
    await salir(pedidoSalir(token, "curl/8.0"));
    expect((await getPlatformSession(token, { ua: UA }))?.username).toBe(sa);
  });

  it("el proxy (/api/superadmin/*) responde 401 a la copia tras el «Salir»", async () => {
    const token = await createPlatformToken(sa, UA);
    const pedido = () =>
      new NextRequest("http://localhost:3000/api/superadmin/stores", {
        headers: { "user-agent": UA, cookie: `buleje-platform-sess=${token}` },
      });
    const antes = await guardSuperadminApi(pedido(), "/api/superadmin/stores", new Headers());
    expect(antes?.status).toBe(200);
    avanzar(MIN);

    await salir(pedidoSalir(token));
    const despues = await guardSuperadminApi(pedido(), "/api/superadmin/stores", new Headers());
    expect(despues?.status).toBe(401);
  });
});
