import "server-only";
import { logger } from "@/lib/logger";

/**
 * Llaves que viven poco (minutos) y que tienen que verse desde cualquier
 * instancia: los códigos del Modo TV (ADR-473). Upstash, como el resto del
 * módulo (`cuadro-vivo.server.ts`, `contacto.server.ts`).
 *
 * Sin las variables —dev sin configurar, tests— todo vive en un `Map` del
 * proceso: con una sola instancia anda igual; con varias (Vercel) el TV y el
 * panel podrían caer en instancias distintas y el código «no existiría», por
 * eso en producción Upstash es obligatorio para emparejar (ADR-466, mismo
 * criterio). Si una llamada a Upstash falla se loguea y se usa el respaldo.
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
    logger.warn("[camaras.kv] sin Upstash: los códigos del Modo TV viven en la memoria de este proceso");
    return null;
  }
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
  } catch (err) {
    logger.warn("[camaras.kv] Upstash no disponible, uso la memoria", { error: String(err) });
    _redis = null;
  }
  return _redis;
}

/** Respaldo SÓLO para cuando no hay Upstash (ver arriba). */
const memoria = new Map<string, { valor: unknown; vence: number }>();

function deMemoria(clave: string): unknown {
  const e = memoria.get(clave);
  if (!e) return null;
  if (Date.now() >= e.vence) {
    memoria.delete(clave);
    return null;
  }
  return e.valor;
}

export async function kvLeer<T>(clave: string): Promise<T | null> {
  const r = await getRedis();
  if (r) {
    try {
      return ((await r.get(clave)) as T | null) ?? null;
    } catch (err) {
      logger.warn("[camaras.kv] get falló, leo la memoria", { error: String(err) });
    }
  }
  return deMemoria(clave) as T | null;
}

/** SET con vencimiento. `soloSiNueva` = NX: `false` si la clave ya existía. */
export async function kvEscribir(
  clave: string,
  valor: unknown,
  segundos: number,
  opciones: { soloSiNueva?: boolean } = {},
): Promise<boolean> {
  const r = await getRedis();
  if (r) {
    try {
      if (opciones.soloSiNueva) return (await r.set(clave, valor, { nx: true, ex: segundos })) === "OK";
      await r.set(clave, valor, { ex: segundos });
      return true;
    } catch (err) {
      logger.warn("[camaras.kv] set falló, guardo en memoria", { error: String(err) });
    }
  }
  if (opciones.soloSiNueva && deMemoria(clave) !== null) return false;
  memoria.set(clave, { valor, vence: Date.now() + segundos * 1000 });
  return true;
}

/** Borra y dice si ESTE pedido fue el que la borró: es lo que hace «un solo uso» atómico. */
export async function kvBorrar(clave: string): Promise<boolean> {
  const r = await getRedis();
  if (r) {
    try {
      return (await r.del(clave)) > 0;
    } catch (err) {
      logger.warn("[camaras.kv] del falló, borro de la memoria", { error: String(err) });
    }
  }
  const estaba = deMemoria(clave) !== null;
  memoria.delete(clave);
  return estaba;
}

/** Sólo tests: arranca sin nada guardado. */
export function __reiniciarKvEfimero(): void {
  memoria.clear();
  _redis = null;
  _resuelto = false;
}
