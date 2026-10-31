import "server-only";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import {
  DIAS_GUARDADOS,
  campoDelDia,
  campoUltima,
  resumirAperturas,
  type ResumenDeAperturas,
} from "@/lib/admin/aperturas-panel";

/**
 * Dónde se guardan las aperturas del panel: Upstash Redis, UN hash por negocio
 * (`uso-panel:v1:<tenantId>`). Por qué ahí y no en la base:
 *  - `HINCRBY` es atómico: dos personas abriendo el Libro a la vez suman 2, sin
 *    leer-modificar-escribir. Un KV en `PlatformSettings` (JSON entero) perdería
 *    una de las dos y bloquearía la fila del negocio en cada clic.
 *  - Sin schema ni migración: lo que vence (35 días) se poda solo.
 *  - Barato: un registro = 1 HINCRBY por clave + 1 HSET + 1 EXPIRE en un solo
 *    pipeline; leer = 1 HGETALL. El cliente manda cada pestaña una sola vez por
 *    sesión del navegador y junta varias en un envío.
 * Sin las variables (dev sin configurar, tests) vive en un `Map` del proceso,
 * igual que `lib/camaras/kv-efimero.server.ts`.
 */

type Redis = import("@upstash/redis").Redis;
let _redis: Redis | null = null;
let _resuelto = false;

async function getRedis(): Promise<Redis | null> {
  if (_resuelto) return _redis;
  _resuelto = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    logger.warn("[uso-panel] sin Upstash: las aperturas viven en la memoria de este proceso");
    return null;
  }
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
  } catch (err) {
    logger.warn("[uso-panel] Upstash no disponible, uso la memoria", { error: String(err) });
    _redis = null;
  }
  return _redis;
}

const llaveDe = (tenantId: string) => `uso-panel:v1:${tenantId}`;
/** La llave entera vence si nadie abre el panel en este tiempo. */
const VENCE_SEG = (DIAS_GUARDADOS + 5) * 86_400;

/** Respaldo SÓLO para cuando no hay Upstash. */
const memoria = new Map<string, Map<string, number>>();

function sumarEnMemoria(llave: string, dia: string, claves: readonly string[], ahora: number): void {
  const hash = memoria.get(llave) ?? new Map<string, number>();
  memoria.set(llave, hash);
  for (const clave of claves) {
    const campo = campoDelDia(dia, clave);
    hash.set(campo, (hash.get(campo) ?? 0) + 1);
    hash.set(campoUltima(clave), ahora);
  }
}

/** Suma una apertura a cada clave (ya validadas). Nunca tira: un registro perdido no rompe nada. */
export async function sumarAperturas(tenantId: string, claves: readonly string[], ahora: Date = new Date()): Promise<void> {
  if (!tenantId || claves.length === 0) return;
  const llave = llaveDe(tenantId);
  const dia = limaDateKey(ahora);
  const ms = ahora.getTime();
  const r = await getRedis();
  if (r) {
    try {
      const p = r.pipeline();
      for (const clave of claves) p.hincrby(llave, campoDelDia(dia, clave), 1);
      p.hset(llave, Object.fromEntries(claves.map((c) => [campoUltima(c), ms])));
      p.expire(llave, VENCE_SEG);
      await p.exec();
      return;
    } catch (err) {
      logger.warn("[uso-panel] no se pudo sumar en Upstash, uso la memoria", { tenantId, error: String(err) });
    }
  }
  sumarEnMemoria(llave, dia, claves, ms);
}

/** Las aperturas del negocio de los últimos 30 días (7 y 30 por clave). Poda lo vencido sin esperar. */
export async function leerAperturas(tenantId: string, ahora: Date = new Date()): Promise<ResumenDeAperturas> {
  const llave = llaveDe(tenantId);
  const hoy = limaDateKey(ahora);
  const r = await getRedis();
  if (r) {
    try {
      const hash = await r.hgetall<Record<string, unknown>>(llave);
      const resumen = resumirAperturas(hash, hoy);
      if (resumen.viejos.length > 0) {
        void r
          .hdel(llave, ...resumen.viejos)
          .catch((err: unknown) => logger.warn("[uso-panel] no se pudo podar", { tenantId, error: String(err) }));
      }
      return resumen;
    } catch (err) {
      logger.warn("[uso-panel] no se pudo leer de Upstash, uso la memoria", { tenantId, error: String(err) });
    }
  }
  const hash = memoria.get(llave);
  const resumen = resumirAperturas(hash ? Object.fromEntries(hash) : null, hoy);
  for (const campo of resumen.viejos) hash?.delete(campo);
  return resumen;
}
