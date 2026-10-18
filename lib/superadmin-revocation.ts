/**
 * Mecanismo de revocación de sesiones superadmin.
 *
 * Las sesiones del superadmin son JWT stateless (HMAC firmado, 8h max),
 * por lo que NO podemos invalidar tokens individuales sin agregar una
 * tabla de sesiones (decisión a tomar en un ADR futuro).
 *
 * Pero SÍ podemos hacer "force logout global": si seteamos un timestamp
 * mínimo de emisión (`minIssuedAt`), todos los tokens emitidos antes
 * de ese instante quedan inválidos automáticamente. Esto es suficiente
 * para responder a un incidente ("alguien obtuvo el cookie, mata todo").
 *
 * Almacenamiento:
 *  - In-memory (este módulo) por defecto. Sobrevive entre requests del
 *    mismo proceso, pero se resetea con `pm restart` o cold-start serverless.
 *  - TODO opcional: persistir en Redis / fila DB para que sobreviva reboots.
 *    Por ahora la simplicidad gana — el caso de uso es respuesta inmediata
 *    a incidentes, no cumplimiento de auditoría retroactiva.
 *
 * El corte POR superadmin al cerrar sesión (abajo) sí vive en `cacheStore`
 * (Redis si hay), como la lista negra de jti.
 */

import { cacheStore } from "@/lib/cache";

let minIssuedAtMs: number = 0;

/**
 * Devuelve el timestamp mínimo (ms epoch) que un token debe tener para
 * considerarse válido. Si un token fue emitido ANTES de este timestamp,
 * `getPlatformSession` lo rechaza.
 */
export function getMinIssuedAt(): number {
  return minIssuedAtMs;
}

/**
 * Setea el timestamp mínimo de emisión a `now()`. Efecto: todas las
 * sesiones existentes quedan inválidas en su próximo request.
 *
 * Devuelve el nuevo timestamp para auditoría.
 */
export function revokeAllSessions(): number {
  minIssuedAtMs = Date.now();
  return minIssuedAtMs;
}

// ── Corte por superadmin al cerrar sesión (18-10) ─────────────────────────────
// Pedido de Brandon: «sales a las 10:00 y la copia de tu sesión muere a las
// 10:00». El token es stateless, así que «Salir» anota un corte por superadmin y
// `getPlatformSession` rechaza todo token suyo emitido antes (por `iat`, que la
// rotación conserva: una copia vieja rotada sigue cayendo). Mismo almacén que la
// lista negra de jti (memoria del proceso + Redis si hay `REDIS_URL`); a otra
// instancia le llega en el primer pedido que lo busca (precarga asíncrona).
// Dura la vida máxima del token de plataforma (8 h = `DURATION_MS` de
// superadmin-session) + 1 min: tras el corte una copia ya no puede rotar, así que
// su `exp` no pasa de ahí. Cae todo `iat` ≤ corte; un login posterior nace con
// `iat` > corte (createPlatformToken) y vale.
const PREFIJO_PLATAFORMA = "platform-revocado-antes";
const TTL_PLATAFORMA_S = 8 * 60 * 60 + 60;

function clavePlataforma(username: string): string {
  return `${PREFIJO_PLATAFORMA}:${username}`;
}

/**
 * Corta las sesiones de plataforma de `username` emitidas antes de `antesDeMs`.
 * Nunca retrocede un corte ya anotado (dos logouts seguidos dejan el último).
 */
export function revocarSesionesDePlataforma(username: string, antesDeMs: number = Date.now()): number {
  const corte = Math.max(corteDeSesionesDePlataforma(username), antesDeMs);
  cacheStore.set(clavePlataforma(username), corte, TTL_PLATAFORMA_S);
  return corte;
}

/** Corte vigente (ms epoch) de `username`; 0 si no hay. */
export function corteDeSesionesDePlataforma(username: string): number {
  const corte = cacheStore.get<number>(clavePlataforma(username));
  return typeof corte === "number" && Number.isFinite(corte) ? corte : 0;
}
