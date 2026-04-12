/**
 * lib/cache/cache-wrapper.ts
 *
 * Helpers tipados para cachear funciones async usando getOrSet de lib/cache.ts.
 * Tres variantes de TTL predefinidas + una genérica con opciones completas.
 *
 * Reglas del proyecto (caching-strategy.instructions.md):
 *   - La clave SIEMPRE debe incluir tenantId (nunca cachear datos cross-tenant)
 *   - TTL máximo: 600s (10 min) para datos que afectan la experiencia de compra
 *   - No cachear datos de stock, autenticación ni sesiones
 *   - No cachear respuestas de error (fn debe lanzar en caso de fallo)
 *
 * Ejemplo de uso:
 *   const settings = await withMediumCache(
 *     `settings:${tenantId}`,
 *     () => SettingsDB.get(tenantId)
 *   );
 */

import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";

export interface CacheWrapperOptions {
  /** TTL en segundos */
  ttl: number;
}

/**
 * Wrapper genérico — elige el TTL manualmente.
 * La función `fn` DEBE lanzar error si la fuente falla (no cachear errores).
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheWrapperOptions
): Promise<T> {
  return getOrSet(key, options.ttl, fn);
}

/**
 * Cache corta — 60 segundos.
 * Para datos que cambian frecuentemente pero toleran 1 min de stale.
 * Ej: contadores, notificaciones, alertas de stock.
 */
export async function withShortCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return getOrSet(key, 60, fn);
}

/**
 * Cache media — 300 segundos (5 minutos).
 * Para catálogos, configuraciones, categorías.
 * Ej: products:{tenantId}, settings:{tenantId}
 */
export async function withMediumCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return getOrSet(key, 300, fn);
}

/**
 * Cache larga — 600 segundos (10 minutos).
 * Para datos que raramente cambian: categorías, configuración global.
 * LÍMITE MÁXIMO permitido por la estrategia de caché del proyecto.
 */
export async function withLongCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return getOrSet(key, 600, fn);
}

// ── Re-exports de invalidación para conveniencia ───────────────────────────────

export { invalidate, invalidateByPrefix };
