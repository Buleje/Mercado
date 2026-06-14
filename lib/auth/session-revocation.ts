import "server-only";
import { cacheStore } from "@/lib/cache";

/**
 * Revocación masiva de sesiones por admin — "cerrar todas las sesiones" (ADR-133
 * follow-up). En vez de trackear cada jti activo, aprovechamos que el jti ya
 * codifica su hora de emisión: `${Date.now().toString(36)}-${uuid}` (ver
 * lib/session.ts createSessionToken/createRefreshToken). Guardamos un "corte"
 * por admin; cualquier token (access o refresh) emitido ANTES del corte se
 * rechaza, sin tocar el minteo de tokens.
 *
 * Best-effort por instancia: usa el mismo cacheStore que la blacklist de jti de
 * logout (pentest F1/H007). En multi-instancia es el mismo alcance que esa
 * blacklist ya existente. Fail-open hacia la sesión válida: si no hay corte o el
 * jti no trae timestamp, NO se bloquea.
 */

const PREFIX = "sessions-revoked-before";
// El corte cubre la ventana máxima de un refresh token (7 días). Pasada esa
// ventana ya no puede existir un token viejo válido, así que la marca expira.
const TTL_SEC = 7 * 24 * 60 * 60;

function key(tenantId: string, username: string): string {
  return `${PREFIX}:${tenantId}:${username}`;
}

/** Hora de emisión (ms) embebida en el prefijo base36 del jti. */
function issuedAtFromJti(jti: string | undefined): number | null {
  if (!jti) return null;
  const prefix = jti.split("-")[0];
  if (!prefix) return null;
  const ms = parseInt(prefix, 36);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Marca el corte de revocación de un admin en `beforeMs`. Todo token emitido
 * antes de ese instante deja de ser válido en el próximo request.
 */
export function revokeSessionsBefore(tenantId: string, username: string, beforeMs: number): void {
  cacheStore.set(key(tenantId, username), beforeMs, TTL_SEC);
}

/**
 * `true` si el token (según su jti) fue emitido ANTES del corte registrado para
 * ese admin. Sin corte o sin timestamp en el jti → `false` (no bloquea).
 */
export function isSessionRevoked(
  jti: string | undefined,
  tenantId: string | undefined,
  username: string | undefined,
): boolean {
  if (!tenantId || !username) return false;
  const cutoff = cacheStore.get<number>(key(tenantId, username));
  if (!cutoff) return false;
  const issuedAt = issuedAtFromJti(jti);
  if (issuedAt == null) return false;
  return issuedAt < cutoff;
}
