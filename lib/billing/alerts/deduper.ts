/**
 * ADR-047 — Alert Deduplicator.
 *
 * Evita enviar la misma alerta de quota más de una vez por día por tenant.
 * Key de dedup: `tenantId:event:level:YYYY-MM-DD`.
 *
 * Implementado sobre un Map in-process (suficiente para v1 de single-instance).
 * En entornos multi-instancia, migrar a Redis con TTL (ADR futuro).
 */

export type AlertLevel = "warning" | "critical";

const _sent = new Map<string, number>(); // key → timestamp ms del último envío

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verifica si ya se envió una alerta para esta combinación hoy.
 * Retorna `true` si debe suprimir (ya se envió), `false` si debe enviar.
 */
export function isDuplicate(
  tenantId: string,
  event: string,
  level: AlertLevel,
  now = Date.now(),
): boolean {
  const key = buildKey(tenantId, event, level, now);
  const last = _sent.get(key);
  return last !== undefined && now - last < DAY_MS;
}

/**
 * Marca la alerta como enviada. Llamar después de un envío exitoso.
 */
export function markSent(
  tenantId: string,
  event: string,
  level: AlertLevel,
  now = Date.now(),
): void {
  const key = buildKey(tenantId, event, level, now);
  _sent.set(key, now);
}

function buildKey(
  tenantId: string,
  event: string,
  level: AlertLevel,
  now: number,
): string {
  const date = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
  return `${tenantId}:${event}:${level}:${date}`;
}

/** Para tests: limpia el estado de dedup. */
export function _resetForTest(): void {
  _sent.clear();
}
