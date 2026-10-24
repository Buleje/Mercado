/**
 * placa-peru-store (29-09-2026) — el tope de consultas PAGAS por negocio y la
 * caché de placas en UNA clave podada.
 *
 * Con el plan gratis de json.pe (100 créditos, 5 por consulta) el rate limit
 * genérico dejaba gastar el mes entero en un rato. Acá: 10 por día y 60 por mes
 * por negocio, contados en Upstash si está y si no en la base (clave `interno:`
 * por negocio, escrita bajo lock). La caché no cuenta.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  /** `PlatformSetting` en memoria: `actualizar` aplica el cambio como la tx real. */
  const kv = new Map<string, unknown>();
  const actualizar = vi.fn(async (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
    const r = await cambio(kv.get(key) ?? null);
    if (r.valor !== undefined) kv.set(key, r.valor);
    return r.resultado;
  });
  /** Upstash en memoria (sólo lo que usa el store). */
  const redis = new Map<string, unknown>();
  const cliente = {
    get: async (k: string) => redis.get(k) ?? null,
    set: vi.fn(async (k: string, v: unknown) => {
      redis.set(k, v);
      return "OK";
    }),
    incr: async (k: string) => {
      const n = Number(redis.get(k) ?? 0) + 1;
      redis.set(k, n);
      return n;
    },
    decr: async (k: string) => {
      const n = Number(redis.get(k) ?? 0) - 1;
      redis.set(k, n);
      return n;
    },
    expire: vi.fn(async () => 1),
  };
  return { kv, actualizar, redis, cliente };
});

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: { get: async (k: string) => H.kv.get(k) ?? null, actualizar: H.actualizar },
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {
      return H.cliente;
    }
  },
}));

import {
  _reiniciarRedisParaTests,
  guardarCachePlaca,
  leerCachePlaca,
  podarCache,
  reservarConsulta,
  topeConsultas,
  usoDeHoy,
  type Cacheada,
} from "@/lib/integrations/placa-peru-store";

// 29-09 a las 10:00 de Lima (15:00 UTC).
const AHORA = Date.parse("2026-09-29T15:00:00Z");
const TOPE = { dia: 3, mes: 5, mesGlobal: 50 };
const USO = "interno:placa-externa-uso";
const usoDe = (tenantId: string) => (H.kv.get(USO) as { negocios: Record<string, unknown> } | undefined)?.negocios[tenantId];
const encontrada = (consultadoEn: string): Cacheada => ({
  consultadoEn,
  encontrada: true,
  datos: { placa: "W2D853", marca: "VOLVO", modelo: "FH", color: null, serie: null, motor: null, vin: null },
});

function sinRedis() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  _reiniciarRedisParaTests();
}
function conRedis() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
  _reiniciarRedisParaTests();
}

beforeEach(() => {
  H.kv.clear();
  H.redis.clear();
  H.actualizar.mockClear();
  H.cliente.set.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("topeConsultas", () => {
  it("10 por día y 60 por mes por negocio, 20 por mes la cuenta; se cambia por env; basura = default", () => {
    vi.stubEnv("PLACA_API_TOPE_DIA", "");
    vi.stubEnv("PLACA_API_TOPE_MES", "");
    vi.stubEnv("PLACA_API_TOPE_MES_GLOBAL", "");
    expect(topeConsultas()).toEqual({ dia: 10, mes: 60, mesGlobal: 20 });
    vi.stubEnv("PLACA_API_TOPE_DIA", "4");
    vi.stubEnv("PLACA_API_TOPE_MES", "veinte");
    vi.stubEnv("PLACA_API_TOPE_MES_GLOBAL", "40");
    expect(topeConsultas()).toEqual({ dia: 4, mes: 60, mesGlobal: 40 });
  });
});

describe("reservarConsulta — en la base (sin Redis)", () => {
  beforeEach(sinRedis);

  it("cuenta por negocio y corta en el tope del día", async () => {
    for (let i = 0; i < 3; i++) expect((await reservarConsulta("t-blas", AHORA, TOPE)).ok).toBe(true);
    expect(await reservarConsulta("t-blas", AHORA, TOPE)).toEqual({ ok: false, alcanzado: "dia", tope: 3 });
    // Otro negocio no gasta el tope de Blas.
    expect((await reservarConsulta("t-main", AHORA, TOPE)).ok).toBe(true);
    expect(usoDe("t-blas")).toEqual({ dia: "2026-09-29", enDia: 3, mes: "2026-09", enMes: 3 });
    // Todo en UNA clave (un solo lock): el de la cuenta suma los dos negocios.
    expect([...H.kv.keys()]).toEqual([USO]);
    expect(H.kv.get(USO)).toMatchObject({ global: { mes: "2026-09", enMes: 4 } });
  });

  it("al día siguiente vuelve a haber cupo del día, pero el mes sigue sumando hasta su tope", async () => {
    for (let i = 0; i < 3; i++) await reservarConsulta("t-blas", AHORA, TOPE);
    const manana = AHORA + 24 * 60 * 60 * 1000;
    expect((await reservarConsulta("t-blas", manana, TOPE)).ok).toBe(true);
    expect((await reservarConsulta("t-blas", manana, TOPE)).ok).toBe(true);
    expect(await reservarConsulta("t-blas", manana, TOPE)).toEqual({ ok: false, alcanzado: "mes", tope: 5 });
  });

  it("el día es el de Lima: las 23:00 de Lima (04:00 UTC) todavía es el mismo día", async () => {
    await reservarConsulta("t-blas", Date.parse("2026-09-30T04:00:00Z"), TOPE);
    expect(usoDe("t-blas")).toMatchObject({ dia: "2026-09-29" });
  });

  it("liberar() devuelve la consulta; si ya cambió el día, no toca el de hoy", async () => {
    const r = await reservarConsulta("t-blas", AHORA, TOPE);
    if (!r.ok) throw new Error("debía reservar");
    await r.liberar();
    expect(usoDe("t-blas")).toMatchObject({ enDia: 0, enMes: 0 });
    expect(H.kv.get(USO)).toMatchObject({ global: { enMes: 0 } });

    const vieja = await reservarConsulta("t-blas", AHORA, TOPE);
    if (!vieja.ok) throw new Error("debía reservar");
    await reservarConsulta("t-blas", AHORA + 24 * 60 * 60 * 1000, TOPE);
    await vieja.liberar();
    expect(usoDe("t-blas")).toMatchObject({ dia: "2026-09-30", enDia: 1 });
  });

  it("tope 0 = SUNARP apagado, sin escribir nada", async () => {
    expect(await reservarConsulta("t-blas", AHORA, { dia: 0, mes: 60, mesGlobal: 20 })).toEqual({ ok: false, alcanzado: "dia", tope: 0 });
    expect(await reservarConsulta("t-blas", AHORA, { dia: 10, mes: 60, mesGlobal: 0 })).toEqual({ ok: false, alcanzado: "global", tope: 0 });
    expect(H.actualizar).not.toHaveBeenCalled();
  });

  it("el tope de la CUENTA corta aunque cada negocio tenga cupo (plan gratis: 20 al mes en total)", async () => {
    const tope = { dia: 10, mes: 60, mesGlobal: 4 };
    for (const t of ["t-blas", "t-blas", "t-main", "t-otro"]) expect((await reservarConsulta(t, AHORA, tope)).ok).toBe(true);
    expect(await reservarConsulta("t-nuevo", AHORA, tope)).toEqual({ ok: false, alcanzado: "global", tope: 4 });
    // El negocio que no pasó no quedó contado.
    expect(usoDe("t-nuevo")).toBeUndefined();
    // Al mes siguiente vuelve a haber cupo.
    expect((await reservarConsulta("t-nuevo", Date.parse("2026-10-02T15:00:00Z"), tope)).ok).toBe(true);
  });

  it("usoDeHoy: lo guardado de otro día o mes vuelve a 0; lo roto también", () => {
    expect(usoDeHoy({ dia: "2026-09-28", enDia: 9, mes: "2026-09", enMes: 30 }, "2026-09-29")).toEqual({ dia: "2026-09-29", enDia: 0, mes: "2026-09", enMes: 30 });
    expect(usoDeHoy({ dia: "2026-08-31", enDia: 9, mes: "2026-08", enMes: 59 }, "2026-09-01")).toEqual({ dia: "2026-09-01", enDia: 0, mes: "2026-09", enMes: 0 });
    expect(usoDeHoy("basura", "2026-09-29")).toEqual({ dia: "2026-09-29", enDia: 0, mes: "2026-09", enMes: 0 });
  });
});

describe("reservarConsulta — en Redis", () => {
  beforeEach(conRedis);

  it("INCR por día y mes con vencimiento; al pasarse devuelve lo sumado", async () => {
    for (let i = 0; i < 3; i++) expect((await reservarConsulta("t-blas", AHORA, TOPE)).ok).toBe(true);
    expect(await reservarConsulta("t-blas", AHORA, TOPE)).toEqual({ ok: false, alcanzado: "dia", tope: 3 });
    expect(H.redis.get("placa-externa-uso:t-blas:d:2026-09-29")).toBe(3);
    expect(H.redis.get("placa-externa-uso:t-blas:m:2026-09")).toBe(3);
    expect(H.redis.get("placa-externa-uso:_plataforma:m:2026-09")).toBe(3);
    expect(H.cliente.expire).toHaveBeenCalledWith("placa-externa-uso:t-blas:d:2026-09-29", 172800);
    // Con Redis no se escribe la base.
    expect(H.actualizar).not.toHaveBeenCalled();
  });

  it("el contador de la cuenta es uno para todos los negocios; liberar devuelve los tres", async () => {
    const tope = { dia: 10, mes: 60, mesGlobal: 2 };
    const a = await reservarConsulta("t-blas", AHORA, tope);
    expect((await reservarConsulta("t-main", AHORA, tope)).ok).toBe(true);
    expect(await reservarConsulta("t-otro", AHORA, tope)).toEqual({ ok: false, alcanzado: "global", tope: 2 });
    expect(H.redis.get("placa-externa-uso:t-otro:d:2026-09-29")).toBe(0);
    if (!a.ok) throw new Error("debía reservar");
    await a.liberar();
    expect(H.redis.get("placa-externa-uso:_plataforma:m:2026-09")).toBe(1);
    expect(H.redis.get("placa-externa-uso:t-blas:d:2026-09-29")).toBe(0);
    expect((await reservarConsulta("t-otro", AHORA, tope)).ok).toBe(true);
  });
});

describe("caché de placas", () => {
  it("sin Redis: UNA clave interna con el mapa, sin filas por placa", async () => {
    sinRedis();
    await guardarCachePlaca("W2D853", encontrada("2026-09-29T15:00:00.000Z"), 30 * 86400, AHORA);
    await guardarCachePlaca("AXQ871", encontrada("2026-09-29T15:01:00.000Z"), 30 * 86400, AHORA);
    expect([...H.kv.keys()]).toEqual(["interno:placa-externa-cache"]);
    expect(await leerCachePlaca("W2D853")).toMatchObject({ encontrada: true });
    expect(await leerCachePlaca("V2H901")).toBeNull();
  });

  it("con Redis: una clave por placa con su TTL, y la base no se toca", async () => {
    conRedis();
    await guardarCachePlaca("W2D853", encontrada("2026-09-29T15:00:00.000Z"), 7 * 86400, AHORA);
    expect(H.cliente.set).toHaveBeenCalledWith("placa-externa:v1:W2D853", expect.objectContaining({ encontrada: true }), { ex: 604800 });
    expect(await leerCachePlaca("W2D853")).toMatchObject({ encontrada: true });
    expect(H.actualizar).not.toHaveBeenCalled();
  });

  it("podarCache: se quedan las más nuevas hasta el tope y se van las vencidas", () => {
    const entradas: Record<string, Cacheada> = {};
    for (let i = 0; i < 8; i++) entradas[`P${i}`] = encontrada(new Date(AHORA - i * 60_000).toISOString());
    entradas.VIEJA = encontrada("2026-08-01T00:00:00.000Z");
    const podado = podarCache(entradas, AHORA, 5);
    expect(Object.keys(podado)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(podarCache(entradas, AHORA)).not.toHaveProperty("VIEJA");
  });
});
