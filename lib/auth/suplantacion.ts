/**
 * Sesión de suplantación: cuando el superadmin entra «como» una tienda
 * (POST /api/superadmin/impersonate), el token de admin lleva como usuario
 * `impersonated-by:<superadmin>`. Un solo lugar para el prefijo: lo firman la
 * suplantación, lo reconoce el refresh (que no la rota) y lo exige la salida.
 *
 * La suplantación vive SOLO los minutos que eligió el superadmin al entrar
 * (cookie y token): no tiene refresh token y no se renueva.
 */
export const PREFIJO_SUPLANTACION = "impersonated-by:";

/**
 * Vida de la vista de tienda, en minutos (18-10, pedido de Brandon: «que se
 * pueda personalizar de 5 hasta 1 hora»). El superadmin la elige al entrar;
 * sin elegir, 10 min (la decisión de seguridad S3 del 2026-05-21, 30 → 10).
 * Un solo lugar: el POST de la suplantación valida con MIN/MAX, la UI ofrece
 * OPCIONES y el navegador sanea lo que leyó de localStorage.
 */
export const MINUTOS_SUPLANTACION_MIN = 5;
export const MINUTOS_SUPLANTACION_MAX = 60;
export const MINUTOS_SUPLANTACION_DEFECTO = 10;
export const OPCIONES_MINUTOS_SUPLANTACION = [5, 10, 15, 30, 45, 60] as const;

/**
 * Vida por defecto en segundos (cookie Y token; antes el token vivía 15 min).
 * La real la decide el POST con `minutos`; el panel cuenta lo que queda con el
 * `exp` del token, no con esta constante.
 */
export const DURACION_SUPLANTACION_S = MINUTOS_SUPLANTACION_DEFECTO * 60;

/**
 * Lo más que puede vivir un token de suplantación. «Salir» y el logout anulan su
 * jti al menos por esto: con la lista negra de 15 min de un token normal, una
 * copia de una vista de 60 min volvía a entrar a los 15 min de haber salido.
 */
export const VIDA_MAXIMA_SUPLANTACION_S = MINUTOS_SUPLANTACION_MAX * 60;

/**
 * Minutos válidos para una vista de tienda: un entero entre MIN y MAX. Cualquier
 * otra cosa (null, texto, 7.5, 0, 120) cae al de por defecto. Es para lo que el
 * navegador guardó; el servidor no sanea: rechaza con 400 lo que esté fuera.
 */
export function minutosDeSuplantacion(valor: unknown): number {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  if (typeof n !== "number" || !Number.isInteger(n)) return MINUTOS_SUPLANTACION_DEFECTO;
  if (n < MINUTOS_SUPLANTACION_MIN || n > MINUTOS_SUPLANTACION_MAX) return MINUTOS_SUPLANTACION_DEFECTO;
  return n;
}

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
