import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidate } from "@/lib/cache";

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
   * Read ALL platform settings at once.
   * Returns a plain Record. Cached 5 min under key `platform-settings:__all__`.
   */
  async getAll(): Promise<Record<string, unknown>> {
    return getOrSet<Record<string, unknown>>(
      cacheKey("__all__"),
      CACHE_TTL_SEC,
      async () => {
        const rows = await prisma.platformSetting.findMany({
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
    invalidate(cacheKey(key));
    invalidate(cacheKey("__all__"));
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

    for (const key of keys) {
      invalidate(cacheKey(key));
    }
    invalidate(cacheKey("__all__"));
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
    invalidate(cacheKey(key));
    invalidate(cacheKey("__all__"));
  },
};
