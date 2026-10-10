/**
 * Hik-Connect for Teams en la pantalla (ADR-471) — lo puro: enlaces de la
 * guía, el corte por inactividad y los errores del reproductor EZUIKit.
 * Sin React; lo prueba `__tests__/camaras-hik-connect-api.test.ts`.
 *
 * Fuentes de la guía (verificadas el 05-10-2026):
 *  · Modo equipo: «you can switch to teammode here: https://www.hik-connect.com/views/login/index.html#/portal»
 *    (pergolafabio/Hikvision-Addons#282).
 *  · Claves: «Hik-Connect Portal → Team Management → Team Configuration → API
 *    Integration to copy the Account (API Key) and Password (API Secret)»
 *    (README de Frens98/hikconnect-nvr); «Every user can generate those keys
 *    inside TeamManagement → Api Integration» (#282, 05-05-2026).
 *  · Si esa opción no aparece: TPP «Hik-Connect Integration», paso 02 «Provide
 *    registered Hik-Connect email address to Hikvision for API Key application».
 *  · Código de verificación dentro de la URL EZOPEN y error 5 del reproductor =
 *    «加密设备密码错误» (clave del equipo cifrado incorrecta): README de
 *    `ezuikit-js` 9.0.23.
 */

export const ENLACES_TEAMS = {
  portal: "https://www.hik-connect.com/views/login/index.html#/portal",
  tpp: "https://tpp.hikvision.com/products/HC-Integration",
} as const;

/** El vivo despierta la cámara solar: sin tocar nada en este tiempo, se corta. */
export const MINUTOS_SIN_TOCAR = 5;

/** Datos del chip, rango para el aviso (SD ~1 Mbps a HD ~8 Mbps). */
export const DATOS_POR_HORA = "entre 0,4 y 3,6 GB por hora";

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;

/**
 * Lo que EZUIKit pasa a `handleError` no tiene forma fija: `{ type, data:
 * { nErrorCode } }`, `{ retcode, msg }`, `{ code, msg }`. Se busca el código
 * en esos lugares y se traduce lo conocido.
 */
export function mensajeDelReproductor(err: unknown): string {
  const e = obj(err);
  const data = obj(e?.data);
  if (e?.type === "handleRunTimeInfoError" && Number(data?.nErrorCode) === 5)
    return "El código de verificación no es el de la cámara. Revísalo en la etiqueta (6 letras) y cárgalo de nuevo en «Enlazar».";
  const codigo = String(e?.retcode ?? e?.code ?? data?.code ?? data?.retcode ?? "");
  if (/60019/.test(codigo))
    return "El video está cifrado: carga el código de verificación de la cámara en «Enlazar».";
  if (/20007/.test(codigo))
    return "La cámara está desconectada (sin datos, sin batería o dormida).";
  if (/20008/.test(codigo))
    return "La cámara tardó demasiado en contestar (señal 4G débil). Prueba en SD.";
  if (/10002/.test(codigo)) return "El permiso de video venció. Toca «Reintentar».";
  const msg = typeof e?.msg === "string" ? e.msg : typeof data?.msg === "string" ? data.msg : "";
  return msg
    ? `El reproductor no pudo mostrar el video (${codigo || "sin código"}: ${msg}).`
    : "El reproductor no pudo mostrar el video. Toca «Reintentar».";
}

/** «2026-10-05» de hoy en la hora del navegador, para el valor por defecto del formulario. */
export function hoyLocal(ahora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

/** Una hora antes de ahora («HH:MM»), para «Ver grabación». */
export function horaHaceUnaHora(ahora = new Date()): string {
  const d = new Date(ahora.getTime() - 3_600_000);
  if (d.getDate() !== ahora.getDate()) return "00:00";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
