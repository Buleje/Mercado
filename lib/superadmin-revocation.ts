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
 */

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
