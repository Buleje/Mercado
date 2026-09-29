import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidate } from "@/lib/cache";
import { esEsperaDeLockVencida } from "@/lib/errores/codigo-pg";

/**
 * lib/db/platform-settings.db.ts
 *
 * Canonical DB class for the PlatformSetting global key/value store.
 *
 * Unlike most DB classes in this project, PlatformSetting is **GLOBAL** —
 * it is the platform configuration itself (plan prices, maintenance mode,
 * feature flags), NOT per-tenant data. As such there is no `tenantId`
 * parameter — there is only one platform.
 *
 * Usage:
 *   const prices = await PlatformSettingsDB.get<Record<string, number>>("plan-prices");
 *   await PlatformSettingsDB.set("plan-prices", { free: 0, pro: 49, ... }, "admin@bsm");
 *
 * Cache strategy (patrón híbrido del proyecto, ver lib/cache.ts):
 *   - getOrSet + TTL 5 min → reads son ~sub-ms en warm serverless
 *   - invalidate(key) tras writes → consistency eventual
 *   - Clave: `platform-settings:{key}`
 *
 * Fix del bug MRR fake 2026-04-09 — lee/escribe siempre por aquí, jamás
 * duplicar precios hardcoded en otras rutas.
 */

// ── Tipos de valores JSON permitidos en PlatformSetting.value ──────────────
// Prisma requiere `Prisma.InputJsonValue` (NO admite `null` — para null hay
// que usar `Prisma.JsonNull`). Para los callers exponemos `unknown` y hacemos
// el cast unsafe en el boundary (el API layer valida con Zod antes de llegar).

const CACHE_TTL_SEC = 300; // 5 min
const CACHE_PREFIX = "platform-settings:";

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Claves de TRABAJO, no de configuración (29-09-2026): la caché de placas y el
 * contador de consultas pagas por negocio. Se escriben en cada búsqueda, así
 * que no pueden invalidar `__all__` (lo lee el layout de toda la plataforma
 * vía `getPlatformConfigSSR`) ni viajar dentro de `getAll()`.
 */
export const PREFIJO_INTERNO = "interno:";
const esInterna = (key: string) => key.startsWith(PREFIJO_INTERNO);

/** Invalida la clave y —si es de configuración— la foto de `getAll()`. */
function invalidarClave(key: string): void {
  invalidate(cacheKey(key));
  if (!esInterna(key)) invalidate(cacheKey("__all__"));
}

/** Otra transacción tiene tomada la clave (`actualizar` con `soloSiLibre` o `esperaMaxMs`). */
export class ClaveOcupadaError extends Error {
  constructor(readonly key: string) {
    super(`La clave ${key} está tomada por otra transacción.`);
    this.name = "ClaveOcupadaError";
  }
}

export const PlatformSettingsDB = {
  /**
   * Read a single platform setting by key.
   * Returns null if the key doesn't exist.
   * Cached 5 min cross-request.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    return getOrSet<T | null>(cacheKey(key), CACHE_TTL_SEC, async () => {
      const row = await prisma.platformSetting.findUnique({
        where: { key },
        select: { value: true },
      });
      if (!row) return null;
      return row.value as unknown as T;
    });
  },

  /**
   * Lee UNA clave de la base, SIN caché (ADR-445).
   *
   * El caché de `get` es memoria de cada instancia (con `REDIS_URL` también:
   * `RedisStore` sirve primero su capa en memoria, y `invalidate` sólo limpia
   * la instancia que escribió). Una lista de trabajo que se lee para volver a
   * mandarla entera —las cubicaciones guardadas— no puede salir de ahí: otra
   * instancia devolvería hasta 5 min de piezas viejas y el POST las reescribiría.
   */
  async getFresco<T = unknown>(key: string): Promise<T | null> {
    const row = await prisma.platformSetting.findUnique({ where: { key }, select: { value: true } });
    return row ? (row.value as unknown as T) : null;
  },

  /**
   * Read ALL platform settings at once.
   * Returns a plain Record. Cached 5 min under key `platform-settings:__all__`.
   */
  async getAll(): Promise<Record<string, unknown>> {
    return getOrSet<Record<string, unknown>>(
      cacheKey("__all__"),
      CACHE_TTL_SEC,
      async () => {
        const rows = await prisma.platformSetting.findMany({
          where: { NOT: { key: { startsWith: PREFIJO_INTERNO } } },
          select: { key: true, value: true },
        });
        const out: Record<string, unknown> = {};
        for (const row of rows) {
          out[row.key] = row.value;
        }
        return out;
      },
    );
  },

  /**
   * Upsert a single platform setting.
   * Invalidates the cache for this key AND the `__all__` cache.
   */
  async set(key: string, value: unknown, updatedBy?: string): Promise<void> {
    const jsonValue = value as Prisma.InputJsonValue;
    await prisma.platformSetting.upsert({
      where: { key },
      create: {
        key,
        value: jsonValue,
        ...(updatedBy !== undefined && { updatedBy }),
      },
      update: {
        value: jsonValue,
        ...(updatedBy !== undefined && { updatedBy }),
      },
    });
    invalidarClave(key);
  },

  /**
   * Upsert multiple platform settings in a single transaction.
   * Invalidates the cache for each key touched AND the `__all__` cache.
   */
  async setMany(
    settings: Record<string, unknown>,
    updatedBy?: string,
  ): Promise<void> {
    const keys = Object.keys(settings);
    if (keys.length === 0) return;

    await prisma.$transaction(
      keys.map((key) => {
        const jsonValue = settings[key] as Prisma.InputJsonValue;
        return prisma.platformSetting.upsert({
          where: { key },
          create: {
            key,
            value: jsonValue,
            ...(updatedBy !== undefined && { updatedBy }),
          },
          update: {
            value: jsonValue,
            ...(updatedBy !== undefined && { updatedBy }),
          },
        });
      }),
    );

    for (const key of keys) invalidarClave(key);
  },

  /**
   * Lee-modifica-escribe UNA clave sin perder escrituras (ADR-445).
   *
   * `get` + `set` sueltos pierden una de dos escrituras simultáneas (las dos
   * leen la misma lista y la segunda pisa a la primera), y leer del caché lo
   * empeora: hasta 5 min de lista vieja. Acá la lectura va a la BASE, dentro de
   * una transacción con `pg_advisory_xact_lock` por clave (el patrón de las
   * numeraciones del libro): la segunda espera y lee lo que la primera grabó.
   *
   * `cambio` recibe el valor actual (o `null`) y devuelve `{ valor, resultado }`;
   * `valor === undefined` = no se escribe nada. Puede usar la `tx` para leer
   * otras tablas bajo el mismo lock.
   */
  async actualizar<T, R>(
    key: string,
    cambio: (
      actual: T | null,
      tx: Prisma.TransactionClient,
    ) => Promise<{ valor?: unknown; resultado: R }> | { valor?: unknown; resultado: R },
    updatedBy?: string,
    /**
     * Opciones de la transacción. Por omisión las de Prisma (5 s): alcanza
     * para leer-modificar-escribir una lista. Quien hace trabajo del libro
     * dentro de `cambio` —registrar una guía desde su anexo (ADR-446)— pasa
     * las suyas.
     */
    opciones?: {
      timeout?: number;
      maxWait?: number;
      /**
       * No esperar: si otra transacción tiene la clave, tira `ClaveOcupadaError`
       * en el acto (`pg_try_advisory_xact_lock`). Para el trabajo largo que no
       * debe hacer fila detrás de otro igual.
       */
      soloSiLibre?: boolean;
      /**
       * Esperar la clave a lo sumo esto (`lock_timeout` LOCAL de la
       * transacción, nunca de sesión: el pooler la pegaría a otras conexiones).
       * Vencido → `ClaveOcupadaError`, en vez del 500 del timeout de Prisma.
       */
      esperaMaxMs?: number;
    },
  ): Promise<R> {
    const lockKey = `platform-setting:${key}`;
    const { soloSiLibre, esperaMaxMs, ...txOpciones } = opciones ?? {};
    const espera = esperaMaxMs != null ? Math.max(1, Math.trunc(esperaMaxMs)) : null;
    let tomado = false;
    let salida: { escrito: boolean; resultado: R };
    try {
      salida = await prisma.$transaction(
        async (tx) => {
          if (soloSiLibre) {
            const [fila] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS ok`;
            if (!fila?.ok) throw new ClaveOcupadaError(key);
          } else {
            if (espera != null) await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${espera}ms`}, true)`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
          }
          tomado = true;
          const row = await tx.platformSetting.findUnique({ where: { key }, select: { value: true } });
          const r = await cambio(row ? (row.value as unknown as T) : null, tx);
          if (r.valor === undefined) return { escrito: false, resultado: r.resultado };
          const jsonValue = r.valor as Prisma.InputJsonValue;
          await tx.platformSetting.upsert({
            where: { key },
            create: { key, value: jsonValue, ...(updatedBy !== undefined && { updatedBy }) },
            update: { value: jsonValue, ...(updatedBy !== undefined && { updatedBy }) },
          });
          return { escrito: true, resultado: r.resultado };
        },
        Object.keys(txOpciones).length > 0 ? txOpciones : undefined,
      );
    } catch (err) {
      /* Sólo la espera de la CLAVE se traduce: un lock que vence dentro de
         `cambio` es de quien llama y lo decide él. */
      if (!tomado && espera != null && esEsperaDeLockVencida(err)) throw new ClaveOcupadaError(key);
      throw err;
    }
    if (salida.escrito) invalidarClave(key);
    return salida.resultado;
  },

  /**
   * Delete a platform setting by key.
   * No-op if the key doesn't exist. Invalidates caches.
   */
  async delete(key: string): Promise<void> {
    await prisma.platformSetting
      .delete({ where: { key } })
      .catch(() => {
        /* swallow — record-not-found is a no-op */
      });
    invalidarClave(key);
  },
};
