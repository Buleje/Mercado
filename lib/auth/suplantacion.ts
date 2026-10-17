/**
 * Sesión de suplantación: cuando el superadmin entra «como» una tienda
 * (POST /api/superadmin/impersonate), el token de admin lleva como usuario
 * `impersonated-by:<superadmin>`. Un solo lugar para el prefijo: lo firman la
 * suplantación, lo reconoce el refresh (que no la rota) y lo exige la salida.
 *
 * La suplantación vive SOLO `DURACION_SUPLANTACION_S` (cookie y token): no
 * tiene refresh token y no se renueva.
 */
export const PREFIJO_SUPLANTACION = "impersonated-by:";

/**
 * Vida de la suplantación: 10 min (decisión de seguridad S3, 2026-05-21). La
 * usan la cookie Y el token (antes el token vivía 15 min), y el panel para
 * contar los minutos que quedan.
 */
export const DURACION_SUPLANTACION_S = 10 * 60;

export function usuarioDeSuplantacion(superadmin: string): string {
  return `${PREFIJO_SUPLANTACION}${superadmin}`;
}

export function esSuplantacion(username: string | null | undefined): boolean {
  return typeof username === "string" && username.startsWith(PREFIJO_SUPLANTACION);
}

/** El superadmin detrás de una sesión de suplantación (o null si no lo es). */
export function superadminDeSuplantacion(username: string): string | null {
  return esSuplantacion(username) ? username.slice(PREFIJO_SUPLANTACION.length) : null;
}
