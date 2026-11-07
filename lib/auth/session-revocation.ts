import "server-only";
import { cacheStore } from "@/lib/cache";
import { getMinIssuedAt } from "@/lib/superadmin-revocation";
import { VIDA_MAXIMA_SUPLANTACION_S, esSuplantacion, superadminDeSuplantacion } from "@/lib/auth/suplantacion";

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

// ── Vistas de tienda de un superadmin (18-10) ─────────────────────────────────
// «Salir del superadmin cierra las tiendas abiertas» (pedido de Brandon): al
// cerrar su sesión de plataforma se anota un corte por superadmin y toda vista
// `impersonated-by:<él>` emitida antes deja de valer, en este navegador y en
// cualquier copia. Mismo almacén que la lista negra de jti (memoria del proceso
// + Redis si hay). Dura lo que la vista más larga (60 min, también tras un
// «+15») más un minuto de margen: pasado eso ya no puede quedar una viva.
const PREFIJO_VISTAS = "vistas-revocadas-antes";
const TTL_VISTAS_SEC = VIDA_MAXIMA_SUPLANTACION_S + 60;

function claveVistas(superadmin: string): string {
  return `${PREFIJO_VISTAS}:${superadmin}`;
}

/**
 * Corta todas las vistas de tienda de `superadmin` emitidas antes de `antesDeMs`.
 * Nunca retrocede un corte ya anotado (dos logouts seguidos dejan el último).
 */
export function revocarVistasDeSuperadmin(superadmin: string, antesDeMs: number = Date.now()): void {
  const previo = cacheStore.get<number>(claveVistas(superadmin)) ?? 0;
  cacheStore.set(claveVistas(superadmin), Math.max(previo, antesDeMs), TTL_VISTAS_SEC);
}

/**
 * `true` si el token (según su jti) fue emitido ANTES del corte registrado para
 * ese admin. Sin corte o sin timestamp en el jti → `false` (no bloquea).
 * Una vista de tienda además cae con el corte global del superadmin y con el
 * de su superadmin al cerrar sesión; ahí, sin hora en el jti, cae (no se sabe
 * si es anterior).
 */
export function isSessionRevoked(
  jti: string | undefined,
  tenantId: string | undefined,
  username: string | undefined,
): boolean {
  if (!tenantId || !username) return false;
  // Vista de tienda del superadmin (hasta 60 min): «Revocar todas las sesiones»
  // del superadmin también la corta (security 18-10). Sin hora en el jti, cae.
  const corteSuperadmin = getMinIssuedAt();
  if (corteSuperadmin > 0 && esSuplantacion(username)) {
    const emitido = issuedAtFromJti(jti);
    if (emitido == null || emitido < corteSuperadmin) return true;
  }
  const superadmin = superadminDeSuplantacion(username);
  if (superadmin !== null) {
    const corteVistas = cacheStore.get<number>(claveVistas(superadmin));
    if (corteVistas) {
      const emitido = issuedAtFromJti(jti);
      if (emitido == null || emitido < corteVistas) return true;
    }
  }
  const cutoff = cacheStore.get<number>(key(tenantId, username));
  if (!cutoff) return false;
  const issuedAt = issuedAtFromJti(jti);
  if (issuedAt == null) return false;
  return issuedAt < cutoff;
}
