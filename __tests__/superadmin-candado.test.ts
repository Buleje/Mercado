/**
 * Candado de credenciales del superadmin (lib/superadmin/candado.ts):
 * hash bcrypt 12, verificar, bloqueo de 15 min tras 5 fallos, cambio con el
 * actual y vencimiento/atadura del desbloqueo de 5 min.
 *
 * PlatformSetting va en memoria (mismo contrato que PlatformSettingsDB: getFresco,
 * actualizar con `valor === undefined` = no escribe, delete). bcrypt es el real.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

const { tabla } = vi.hoisted(() => ({ tabla: new Map<string, unknown>() }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: {
    getFresco: vi.fn(async (k: string) => (tabla.has(k) ? structuredClone(tabla.get(k)) : null)),
    actualizar: vi.fn(async (k: string, cambio: (v: unknown) => Promise<{ valor?: unknown; resultado: unknown }>) => {
      const r = await cambio(tabla.has(k) ? structuredClone(tabla.get(k)) : null);
      if (r.valor !== undefined) tabla.set(k, structuredClone(r.valor));
      return r.resultado;
    }),
    delete: vi.fn(async (k: string) => void tabla.delete(k)),
  },
}));

const totp = vi.hoisted(() => ({ fila: null as null | { totpSecret: string; totpEnabledAt: Date }, stepUp: vi.fn() }));
vi.mock("@/lib/db/admin-totp.db", () => ({ SuperadminTotpDB: { getByUsername: vi.fn(async () => totp.fila) } }));
vi.mock("@/lib/auth/totp-step-up", () => ({ requireTotpStepUp: totp.stepUp }));

import {
  BLOQUEO_MAX_MS,
  BLOQUEO_MS,
  DESBLOQUEO_MS,
  MAX_FALLOS,
  borrarCandado,
  claveCandado,
  configurarCandado,
  desbloqueoVigente,
  duracionBloqueo,
  estadoCandado,
  firmarDesbloqueo,
  leerDesbloqueo,
  reautenticar,
  respuestaSiCandadoCerrado,
  verificarCandado,
} from "@/lib/superadmin/candado";
import { motivoSecretoInvalido, patronValido } from "@/lib/superadmin/candado-reglas";

const SA = "brandon-sa";
const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/140";
const T0 = Date.UTC(2026, 9, 11, 15, 0, 0);

const REAUTH = { reautenticado: true };

beforeAll(() => {
  process.env.AUTH_SECRET = "secreto-de-prueba-del-candado-32-bytes-xx";
  process.env.SUPERADMIN_USERNAME = SA;
  process.env.SUPERADMIN_PASSWORD = "clave-del-superadmin-1";
});
beforeEach(() => {
  tabla.clear();
  totp.fila = null;
  totp.stepUp.mockReset();
});

describe("reglas del secreto", () => {
  it("PIN 4-6 dígitos, patrón ≥4 puntos sin repetir, contraseña ≥8", () => {
    expect(motivoSecretoInvalido("pin", "1234")).toBeNull();
    expect(motivoSecretoInvalido("pin", "123")).not.toBeNull();
    expect(motivoSecretoInvalido("pin", "1234567")).not.toBeNull();
    expect(motivoSecretoInvalido("pin", "12a4")).not.toBeNull();
    expect(patronValido("1475")).toBe(true);
    expect(patronValido("147")).toBe(false);
    expect(patronValido("1471")).toBe(false);
    expect(patronValido("1405")).toBe(false);
    expect(motivoSecretoInvalido("contrasena", "corta")).not.toBeNull();
    expect(motivoSecretoInvalido("contrasena", "larga-de-verdad")).toBeNull();
  });
});

describe("configurar y verificar", () => {
  it("guarda tipo + hash bcrypt 12 bajo una clave interna (nunca el secreto en claro)", async () => {
    expect(await configurarCandado(SA, "pin", "2468", {}, T0)).toEqual({ ok: false, motivo: "requiere_reauth" });
    expect(tabla.size).toBe(0);
    const r = await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    expect(r).toMatchObject({ ok: true, version: expect.any(String) });
    const clave = claveCandado(SA);
    expect(clave).toBe(`interno:candado-credenciales:${SA}`);
    const g = tabla.get(clave) as { tipo: string; hash: string };
    expect(g.tipo).toBe("pin");
    expect(g.hash).toMatch(/^\$2[aby]\$12\$/);
    expect(JSON.stringify(g)).not.toContain("2468");
    expect(await estadoCandado(SA, T0)).toMatchObject({ configurado: true, tipo: "pin", bloqueadoHasta: null });
  }, 30_000);

  it("verifica el correcto y rechaza el errado contando intentos", async () => {
    await configurarCandado(SA, "patron", "15963", REAUTH, T0);
    expect(await verificarCandado(SA, "15963", T0)).toMatchObject({ ok: true });
    expect(await verificarCandado(SA, "15964", T0)).toEqual({ ok: false, motivo: "incorrecto", restantes: MAX_FALLOS - 1 });
    // Un secreto con forma de otro tipo también es un fallo (sin gastar bcrypt).
    expect(await verificarCandado(SA, "1234", T0)).toEqual({ ok: false, motivo: "incorrecto", restantes: MAX_FALLOS - 2 });
    // El acierto limpia el contador.
    expect(await verificarCandado(SA, "15963", T0)).toMatchObject({ ok: true });
    expect((tabla.get(claveCandado(SA)) as { fallos: number }).fallos).toBe(0);
  }, 30_000);

  it("sin candado → sin_candado", async () => {
    expect(await verificarCandado(SA, "1234", T0)).toEqual({ ok: false, motivo: "sin_candado" });
  });

  it("rechaza un candado nuevo que no cumple su tipo", async () => {
    const r = await configurarCandado(SA, "pin", "12", REAUTH, T0);
    expect(r).toMatchObject({ ok: false, motivo: "invalido" });
    expect(tabla.size).toBe(0);
  });

  it("cambiarlo exige el actual; con el actual errado no cambia y cuenta el fallo", async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    expect(await configurarCandado(SA, "contrasena", "nueva-clave-1", {}, T0)).toEqual({ ok: false, motivo: "requiere_actual" });
    expect(await configurarCandado(SA, "contrasena", "nueva-clave-1", { actual: "1111" }, T0)).toMatchObject({ ok: false, motivo: "incorrecto" });
    expect((await estadoCandado(SA, T0)).tipo).toBe("pin");
    expect(await configurarCandado(SA, "contrasena", "nueva-clave-1", { actual: "2468" }, T0)).toMatchObject({ ok: true });
    expect((await estadoCandado(SA, T0)).tipo).toBe("contrasena");
    expect(await verificarCandado(SA, "nueva-clave-1", T0)).toMatchObject({ ok: true });
  }, 60_000);

  it("borrar deja sin candado y dice si había uno (la ruta exige reautenticar antes)", async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    expect(await borrarCandado(SA)).toBe(true);
    expect(tabla.size).toBe(0);
    expect(await borrarCandado(SA)).toBe(false);
  }, 30_000);

  it("«Olvidé mi candado»: con reautenticación lo pisa aunque esté bloqueado, sin el actual", async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    for (let i = 0; i < MAX_FALLOS; i++) await verificarCandado(SA, "x", T0);
    expect((await estadoCandado(SA, T0)).bloqueadoHasta).not.toBeNull();
    expect(await configurarCandado(SA, "pin", "1357", {}, T0)).toMatchObject({ ok: false, motivo: "bloqueado" });
    expect(await configurarCandado(SA, "patron", "7531", REAUTH, T0 + 1)).toMatchObject({ ok: true });
    expect(tabla.get(claveCandado(SA))).toMatchObject({ tipo: "patron", fallos: 0, bloqueos: 0, bloqueadoHasta: null });
  }, 30_000);
});

describe("bloqueo por fallos", () => {
  it(`${MAX_FALLOS} fallos seguidos bloquean 15 min, incluso al correcto; después vuelve a abrir`, async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    for (let i = 1; i < MAX_FALLOS; i++) {
      expect(await verificarCandado(SA, "0000", T0 + i)).toMatchObject({ ok: false, motivo: "incorrecto" });
    }
    const quinto = await verificarCandado(SA, "0000", T0 + MAX_FALLOS);
    expect(quinto).toEqual({ ok: false, motivo: "bloqueado", hasta: T0 + MAX_FALLOS + BLOQUEO_MS, nuevo: true, numero: 1 });
    // Bloqueado: ni el correcto entra, y tampoco se puede cambiar sin esperar.
    expect(await verificarCandado(SA, "2468", T0 + 60_000)).toMatchObject({ ok: false, motivo: "bloqueado" });
    expect(await configurarCandado(SA, "pin", "1357", { actual: "2468" }, T0 + 60_000)).toMatchObject({ ok: false, motivo: "bloqueado" });
    expect((await estadoCandado(SA, T0 + 60_000)).bloqueadoHasta).toBe(T0 + MAX_FALLOS + BLOQUEO_MS);
    // Pasados los 15 min: abre con el correcto y el contador arranca de cero.
    const despues = T0 + MAX_FALLOS + BLOQUEO_MS + 1;
    expect(await verificarCandado(SA, "2468", despues)).toMatchObject({ ok: true });
    expect(tabla.get(claveCandado(SA))).toMatchObject({ fallos: 0, bloqueadoHasta: null, bloqueos: 0 });
  }, 60_000);

  it("cada bloqueo seguido dobla el anterior; sólo un acierto vuelve a 15 min", async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    let t = T0;
    const ciclo = async () => {
      let r;
      // Un secreto con otra forma («x») cuenta como fallo sin gastar bcrypt.
      for (let i = 0; i < MAX_FALLOS; i++) r = await verificarCandado(SA, "x", t);
      return r as { motivo: string; hasta: number; nuevo: boolean; numero: number };
    };
    const esperados = [15, 30, 60].map((m) => m * 60_000);
    for (const [i, dur] of esperados.entries()) {
      const r = await ciclo();
      expect(r).toMatchObject({ motivo: "bloqueado", nuevo: true, numero: i + 1 });
      expect(r.hasta - t).toBe(dur);
      // Mientras dura, un intento más no abre otro bloqueo (no se audita dos veces).
      expect(await verificarCandado(SA, "x", t + 1000)).toMatchObject({ motivo: "bloqueado", nuevo: false });
      t = r.hasta + 1;
    }
    // Pasado el tiempo sin acertar, el contador de bloqueos sigue (el 4.º = 2 h).
    expect((await ciclo()).hasta - t).toBe(2 * 60 * 60_000);
    t += 2 * 60 * 60_000 + 1;
    expect(await verificarCandado(SA, "2468", t)).toMatchObject({ ok: true });
    expect((await ciclo()).hasta - t).toBe(BLOQUEO_MS);
  }, 60_000);

  it("duración: 15 min, 30, 1 h, 2 h… con tope de 24 h", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => duracionBloqueo(n) / 60_000)).toEqual([15, 30, 60, 120, 240, 480, 960]);
    expect(duracionBloqueo(8)).toBe(BLOQUEO_MAX_MS);
    expect(duracionBloqueo(500)).toBe(BLOQUEO_MAX_MS);
  });

  it("fuerza bruta de un PIN de 4: de ~21 días (bloqueo fijo) a más de 5 años", () => {
    /** Minutos de bloqueo para probar `intentos` PIN a 5 por ventana (sin contar el tiempo de cada intento). */
    const minutos = (intentos: number, dur: (n: number) => number) => {
      const ventanas = Math.ceil(intentos / MAX_FALLOS);
      let total = 0;
      for (let n = 1; n < ventanas; n++) total += dur(n);
      return total / 60_000;
    };
    const DIA = 24 * 60;
    const fijo = minutos(10_000, () => BLOQUEO_MS);
    const progresivo = minutos(10_000, duracionBloqueo);
    const progresivoMitad = minutos(5_000, duracionBloqueo);
    expect(Math.round((fijo / DIA) * 10) / 10).toBe(20.8);
    expect(Math.round(progresivo / DIA)).toBe(1993); // 5,46 años para recorrer los 10 000
    expect(Math.round(progresivoMitad / DIA)).toBe(993); // 2,7 años en promedio (la mitad)
  });
});

describe("reautenticación", () => {
  it("pide la contraseña siempre; errada = 422, nunca 401", async () => {
    expect(await reautenticar(SA, undefined)).toMatchObject({ ok: false, status: 400, error: "reauth_requerida" });
    expect(await reautenticar(SA, { contrasena: "otra" })).toMatchObject({ ok: false, status: 422, error: "reauth_invalida" });
    expect(await reautenticar("otro-sa", { contrasena: "clave-del-superadmin-1" })).toMatchObject({ ok: false, status: 422 });
    expect(await reautenticar(SA, { contrasena: "clave-del-superadmin-1" })).toEqual({ ok: true, conTotp: false });
    expect(totp.stepUp).not.toHaveBeenCalled();
  });

  it("con 2FA activo exige también el código (requireTotpStepUp)", async () => {
    totp.fila = { totpSecret: "BASE32", totpEnabledAt: new Date() };
    // Sin código: se pide ANTES de mirar la contraseña (no delata si era buena).
    expect(await reautenticar(SA, { contrasena: "clave-del-superadmin-1" })).toMatchObject({ ok: false, status: 400, error: "totp_requerido" });
    expect(await reautenticar(SA, { contrasena: "otra-cualquiera" })).toMatchObject({ ok: false, status: 400, error: "totp_requerido" });
    expect(totp.stepUp).not.toHaveBeenCalled();
    // Contraseña buena + código malo = contraseña mala + código cualquiera: el mismo error.
    totp.stepUp.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const codigoMalo = await reautenticar(SA, { contrasena: "clave-del-superadmin-1", totpCode: "000000" });
    const claveMala = await reautenticar(SA, { contrasena: "otra-cualquiera", totpCode: "000000" });
    expect(codigoMalo).toMatchObject({ ok: false, status: 422, error: "reauth_invalida" });
    expect(claveMala).toEqual(codigoMalo);
    totp.stepUp.mockResolvedValueOnce(null);
    expect(await reautenticar(SA, { contrasena: "clave-del-superadmin-1", totpCode: "123456" })).toEqual({ ok: true, conTotp: true });
    expect(totp.stepUp).toHaveBeenLastCalledWith(SA, { totpCode: "123456" });
  });
});

describe("candado para suplantar y tocar la seguridad de una tienda", () => {
  const pedido = (token?: string) => ({
    cookies: { get: (n: string) => (n === "sa-candado-cred" && token ? { value: token } : undefined) },
    headers: { get: (n: string) => (n === "user-agent" ? UA : null) },
  });

  it("sin candado configurado no cambia nada", async () => {
    expect(await respuestaSiCandadoCerrado(pedido(), SA, T0)).toBeNull();
  });

  it("con candado: 423 sin desbloqueo, pasa con el desbloqueo vigente", async () => {
    const r = await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    const cerrado = await respuestaSiCandadoCerrado(pedido(), SA, T0);
    expect(cerrado?.status).toBe(423);
    expect(await cerrado?.json()).toMatchObject({ error: "candado_cerrado" });
    const { token } = await firmarDesbloqueo(SA, UA, (r as { version: string }).version, T0);
    expect(await respuestaSiCandadoCerrado(pedido(token), SA, T0 + 1000)).toBeNull();
    expect((await respuestaSiCandadoCerrado(pedido(token), SA, T0 + DESBLOQUEO_MS + 1))?.status).toBe(423);
  }, 30_000);
});

describe("desbloqueo de 5 min", () => {
  it("vale para el mismo superadmin, navegador y versión hasta que vence", async () => {
    const { token, vence } = await firmarDesbloqueo(SA, UA, "v1", T0);
    expect(vence).toBe(T0 + DESBLOQUEO_MS);
    const esperado = { username: SA, userAgent: UA, version: "v1" };
    expect(await leerDesbloqueo(token, esperado, T0 + DESBLOQUEO_MS - 1)).toEqual({ vence });
    expect(await leerDesbloqueo(token, esperado, T0 + DESBLOQUEO_MS)).toBeNull();
    expect(await leerDesbloqueo(token, { ...esperado, username: "otro-sa" }, T0)).toBeNull();
    expect(await leerDesbloqueo(token, { ...esperado, userAgent: "curl/8" }, T0)).toBeNull();
    expect(await leerDesbloqueo(token, { ...esperado, version: "v2" }, T0)).toBeNull();
  });

  it("una firma alterada o un payload cambiado no valen", async () => {
    const { token } = await firmarDesbloqueo(SA, UA, "v1", T0);
    const [payload, firma] = token.split(".");
    const esperado = { username: SA, userAgent: UA, version: "v1" };
    expect(await leerDesbloqueo(`${payload}.${firma.slice(0, -2)}xx`, esperado, T0)).toBeNull();
    const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), exp: T0 + 10 * DESBLOQUEO_MS })).toString("base64url");
    expect(await leerDesbloqueo(`${otro}.${firma}`, esperado, T0 + 2 * DESBLOQUEO_MS)).toBeNull();
  });

  it("desbloqueoVigente lee la cookie y deja de valer al cambiar el candado", async () => {
    await configurarCandado(SA, "pin", "2468", REAUTH, T0);
    const { version } = await estadoCandado(SA, T0);
    const { token } = await firmarDesbloqueo(SA, UA, version ?? "", T0);
    const req = {
      cookies: { get: (n: string) => (n === "sa-candado-cred" ? { value: token } : undefined) },
      headers: { get: (n: string) => (n === "user-agent" ? UA : null) },
    };
    expect(await desbloqueoVigente(req, SA, T0 + 1000)).toMatchObject({ vence: T0 + DESBLOQUEO_MS });
    expect(await desbloqueoVigente(req, SA, T0 + DESBLOQUEO_MS + 1)).toBeNull();
    await configurarCandado(SA, "pin", "1357", { actual: "2468" }, T0 + 2000);
    expect(await desbloqueoVigente(req, SA, T0 + 3000)).toBeNull();
  }, 60_000);
});
