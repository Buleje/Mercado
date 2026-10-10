/**
 * lib/integrations/placa-peru-store.ts — dónde se guardan la caché de placas
 * consultadas y el contador de consultas PAGAS por negocio.
 *
 * Por qué aparte (29-09-2026): json.pe da 100 créditos cada 30 días y cobra 5
 * por consulta (= 20 placas). Con el rate limit genérico (100/min, en memoria)
 * un negocio agotaba el mes en un rato; y la primera caché era una fila de
 * `PlatformSetting` por placa cuyo `set` invalidaba `__all__` —la foto que lee
 * el layout de toda la plataforma— en cada búsqueda.
 *
 *   · Con Upstash (`UPSTASH_REDIS_REST_URL` + `_TOKEN`, el patrón de
 *     `lib/store-page/ab-store.ts`): una clave por placa con su TTL y tres
 *     contadores `INCR`: el negocio por día y por mes (hora de Lima) y la
 *     plataforma por mes (la clave del proveedor es UNA para todos).
 *   · Sin Redis (o si falla): UNA clave `interno:placa-externa-cache` con el
 *     mapa placa → respuesta (tope 500, se van las más viejas) y una clave
 *     `interno:placa-externa-uso` con el uso de la plataforma y de cada negocio,
 *     escritas con `PlatformSettingsDB.actualizar` (lock por clave). El prefijo `interno:`
 *     las deja fuera de `getAll()` y no invalida `__all__`.
 */

import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { PREFIJO_INTERNO, PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { limaDateKey } from "@/lib/utils";
import type { DatosPlacaExterna } from "@/lib/forestal/placa-historial";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Lo más que vale una respuesta guardada (la encontrada): lo demás se poda. */
const VIGENCIA_MAX_MS = 30 * DIA_MS;
/** Tope del mapa de la caché en la base: ~250 bytes por placa → ~125 KB. */
export const TOPE_CACHE_ENTRADAS = 500;

const CLAVE_CACHE = `${PREFIJO_INTERNO}placa-externa-cache`;

// ── Redis (Upstash) ─────────────────────────────────────────────────────────

type Redis = import("@upstash/redis").Redis;
let _redis: Redis | null = null;
let _resuelto = false;

async function getRedis(): Promise<Redis | null> {
  if (_resuelto) return _redis;
  _resuelto = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
  } catch (err) {
    logger.warn("[placa-externa] Upstash no disponible, uso la base", { error: String(err) });
    _redis = null;
  }
  return _redis;
}

/** Sólo para los tests: vuelve a leer las variables de Redis. */
export function _reiniciarRedisParaTests(): void {
  _redis = null;
  _resuelto = false;
}

// ── Caché de respuestas ─────────────────────────────────────────────────────

const datosSchema = z.object({
  placa: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  color: z.string().nullable(),
  serie: z.string().nullable(),
  motor: z.string().nullable(),
  vin: z.string().nullable(),
});

export const cacheadaSchema = z.object({
  consultadoEn: z.string(),
  encontrada: z.boolean(),
  datos: datosSchema.nullable(),
});
export type Cacheada = { consultadoEn: string; encontrada: boolean; datos: DatosPlacaExterna | null };

const mapaSchema = z.object({ entradas: z.record(z.string(), cacheadaSchema) });

/**
 * Deja las `tope` más nuevas y sin las vencidas. Puro: lo prueba el test y lo
 * usa la escritura bajo lock.
 */
export function podarCache(entradas: Record<string, Cacheada>, ahora: number, tope = TOPE_CACHE_ENTRADAS): Record<string, Cacheada> {
  const vivas = Object.entries(entradas)
    .map(([placa, c]) => ({ placa, c, t: Date.parse(c.consultadoEn) }))
    .filter(({ t }) => Number.isFinite(t) && ahora - t < VIGENCIA_MAX_MS)
    .sort((a, b) => b.t - a.t)
    .slice(0, tope);
  return Object.fromEntries(vivas.map(({ placa, c }) => [placa, c]));
}

export async function leerCachePlaca(placa: string): Promise<Cacheada | null> {
  const r = await getRedis();
  if (r) {
    try {
      const v = cacheadaSchema.safeParse(await r.get(`placa-externa:v1:${placa}`));
      return v.success ? v.data : null;
    } catch (err) {
      logger.warn("[placa-externa] Redis get falló, leo la base", { placa, error: String(err) });
    }
  }
  const m = mapaSchema.safeParse(await PlatformSettingsDB.get<unknown>(CLAVE_CACHE));
  return m.success ? (m.data.entradas[placa] ?? null) : null;
}

export async function guardarCachePlaca(placa: string, valor: Cacheada, ttlSeg: number, ahora: number): Promise<void> {
  const r = await getRedis();
  if (r) {
    try {
      await r.set(`placa-externa:v1:${placa}`, valor, { ex: Math.max(60, Math.trunc(ttlSeg)) });
      return;
    } catch (err) {
      logger.warn("[placa-externa] Redis set falló, guardo en la base", { placa, error: String(err) });
    }
  }
  await PlatformSettingsDB.actualizar<unknown, void>(
    CLAVE_CACHE,
    (actual) => {
      const m = mapaSchema.safeParse(actual);
      const entradas = podarCache({ ...(m.success ? m.data.entradas : {}), [placa]: valor }, ahora);
      return { valor: { entradas }, resultado: undefined };
    },
    "placa-externa",
  );
}

// ── Tope de consultas pagas por negocio ─────────────────────────────────────

export interface TopeConsultas {
  /** Por negocio y día (hora de Lima). */
  dia: number;
  /** Por negocio y mes. */
  mes: number;
  /**
   * Por mes para TODA la plataforma: la clave del proveedor es una sola y el
   * plan gratis de json.pe da ~20 placas al mes en total (100 créditos / 5).
   * Sin esto, cada negocio podía gastar 60 y la cuenta moría el primer día.
   */
  mesGlobal: number;
}

function entero(v: string | undefined, porDefecto: number): number {
  const n = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

/**
 * `PLACA_API_TOPE_DIA` (10), `PLACA_API_TOPE_MES` (60) y
 * `PLACA_API_TOPE_MES_GLOBAL` (20). 0 = no consultar.
 */
export function topeConsultas(): TopeConsultas {
  return {
    dia: entero(process.env.PLACA_API_TOPE_DIA, 10),
    mes: entero(process.env.PLACA_API_TOPE_MES, 60),
    mesGlobal: entero(process.env.PLACA_API_TOPE_MES_GLOBAL, 20),
  };
}

export type TopeAlcanzado = "dia" | "mes" | "global";

export type Reserva =
  | { ok: true; usados: TopeConsultas; liberar: () => Promise<void> }
  | { ok: false; alcanzado: TopeAlcanzado; tope: number };

const usoSchema = z.object({ dia: z.string(), enDia: z.number(), mes: z.string(), enMes: z.number() });
type Uso = z.infer<typeof usoSchema>;

/** El uso guardado, llevado al día y al mes de hoy (lo de otro día vuelve a 0). */
export function usoDeHoy(guardado: unknown, dia: string): Uso {
  const mes = dia.slice(0, 7);
  const u = usoSchema.safeParse(guardado);
  const previo = u.success ? u.data : { dia, enDia: 0, mes, enMes: 0 };
  return {
    dia,
    enDia: previo.dia === dia ? previo.enDia : 0,
    mes,
    enMes: previo.mes === mes ? previo.enMes : 0,
  };
}

/**
 * En la base, TODO el uso va en una sola clave: así el del negocio y el de la
 * plataforma se cuentan bajo el MISMO lock (dos claves con dos locks podían
 * dejar pasar una consulta de más entre una y otra).
 */
const CLAVE_USO = `${PREFIJO_INTERNO}placa-externa-uso`;
const usoGuardadoSchema = z.object({
  global: z.object({ mes: z.string(), enMes: z.number() }),
  negocios: z.record(z.string(), usoSchema),
});
type UsoGuardado = z.infer<typeof usoGuardadoSchema>;

function leerUsoGuardado(v: unknown): UsoGuardado {
  const u = usoGuardadoSchema.safeParse(v);
  return u.success ? u.data : { global: { mes: "", enMes: 0 }, negocios: {} };
}

/**
 * Aparta UNA consulta paga para el negocio (y para la plataforma), o dice qué
 * tope se alcanzó. Lo que sale de la caché no pasa por acá: no gasta créditos.
 * Si la consulta después falla por algo que el proveedor no cobra (red, 5xx,
 * clave rechazada, sin créditos), `liberar()` la devuelve a los tres topes.
 */
export async function reservarConsulta(tenantId: string, ahora: number, tope: TopeConsultas = topeConsultas()): Promise<Reserva> {
  if (!tenantId) throw new Error("tenantId is required");
  const dia = limaDateKey(ahora);
  const mes = dia.slice(0, 7);
  if (tope.mesGlobal <= 0) return { ok: false, alcanzado: "global", tope: tope.mesGlobal };
  if (tope.dia <= 0) return { ok: false, alcanzado: "dia", tope: tope.dia };
  if (tope.mes <= 0) return { ok: false, alcanzado: "mes", tope: tope.mes };

  const r = await getRedis();
  if (r) {
    const kd = `placa-externa-uso:${tenantId}:d:${dia}`;
    const km = `placa-externa-uso:${tenantId}:m:${mes}`;
    const kg = `placa-externa-uso:_plataforma:m:${mes}`;
    try {
      const enDia = await r.incr(kd);
      if (enDia === 1) await r.expire(kd, 2 * 24 * 60 * 60);
      const enMes = await r.incr(km);
      if (enMes === 1) await r.expire(km, 40 * 24 * 60 * 60);
      const enGlobal = await r.incr(kg);
      if (enGlobal === 1) await r.expire(kg, 40 * 24 * 60 * 60);
      const devolver = async () => {
        await r.decr(kd);
        await r.decr(km);
        await r.decr(kg);
      };
      const alcanzado: TopeAlcanzado | null =
        enGlobal > tope.mesGlobal ? "global" : enDia > tope.dia ? "dia" : enMes > tope.mes ? "mes" : null;
      if (alcanzado) {
        await devolver();
        return { ok: false, alcanzado, tope: alcanzado === "global" ? tope.mesGlobal : alcanzado === "dia" ? tope.dia : tope.mes };
      }
      return { ok: true, usados: { dia: enDia, mes: enMes, mesGlobal: enGlobal }, liberar: devolver };
    } catch (err) {
      logger.warn("[placa-externa] Redis del contador falló, cuento en la base", { tenantId, error: String(err) });
    }
  }

  return PlatformSettingsDB.actualizar<unknown, Reserva>(
    CLAVE_USO,
    (guardado) => {
      const g = leerUsoGuardado(guardado);
      const enGlobal = g.global.mes === mes ? g.global.enMes : 0;
      const u = usoDeHoy(g.negocios[tenantId], dia);
      if (enGlobal >= tope.mesGlobal) return { resultado: { ok: false, alcanzado: "global", tope: tope.mesGlobal } };
      if (u.enDia >= tope.dia) return { resultado: { ok: false, alcanzado: "dia", tope: tope.dia } };
      if (u.enMes >= tope.mes) return { resultado: { ok: false, alcanzado: "mes", tope: tope.mes } };
      const negocio: Uso = { ...u, enDia: u.enDia + 1, enMes: u.enMes + 1 };
      const valor: UsoGuardado = { global: { mes, enMes: enGlobal + 1 }, negocios: { ...g.negocios, [tenantId]: negocio } };
      return {
        valor,
        resultado: {
          ok: true,
          usados: { dia: negocio.enDia, mes: negocio.enMes, mesGlobal: enGlobal + 1 },
          liberar: async () => {
            await PlatformSettingsDB.actualizar<unknown, void>(
              CLAVE_USO,
              (actual) => {
                const x = leerUsoGuardado(actual);
                const n = x.negocios[tenantId];
                const global = x.global.mes === mes ? { mes, enMes: Math.max(0, x.global.enMes - 1) } : x.global;
                // Si en el medio cambió el día, lo del negocio es de OTRO día: no se toca.
                const negocios =
                  n && n.dia === dia
                    ? { ...x.negocios, [tenantId]: { ...n, enDia: Math.max(0, n.enDia - 1), enMes: Math.max(0, n.enMes - 1) } }
                    : x.negocios;
                return { valor: { global, negocios }, resultado: undefined };
              },
              "placa-externa",
            );
          },
        },
      };
    },
    "placa-externa",
  );
}
