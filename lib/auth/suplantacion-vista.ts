/**
 * La «vista de tienda» del superadmin (suplantación) del lado del navegador:
 * qué tienda se ve, cuándo vence y adónde volver cuando vence o se sale.
 *
 * Sin "use client" a propósito: lo importan el panel, `session-refresh` y la
 * lista de tiendas del superadmin (el parámetro del aviso). La duración y el
 * prefijo viven en `lib/auth/suplantacion.ts`.
 */

/** Marca que deja «Entrar como esta tienda» (abrir-panel-tienda.ts): el slug suplantado. */
export const MARCA_SUPLANTACION = "superadmin-impersonate-tenant";
/** Hora (ms) en que vence la vista, anotada por el panel al detectarla. */
const VENCE_SUPLANTACION = "superadmin-impersonate-vence";
/** Pasado este margen tras el vencimiento la marca se considera vieja (otra sesión). */
const MARGEN_MARCA_VIEJA_MS = 6 * 60 * 60 * 1000;

/** Parámetro con que el superadmin recibe el aviso «la vista de <negocio> venció». */
export const PARAM_VISTA_VENCIDA = "vista-vencida";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/** El panel confirmó (con /api/auth/me) que es una suplantación: anota tienda y vencimiento. */
export function anotarVistaSuplantada(slug: string, vence: number): void {
  try {
    localStorage.setItem(MARCA_SUPLANTACION, slug);
    localStorage.setItem(VENCE_SUPLANTACION, String(vence));
  } catch { /* modo privado: al vencer cae al login de siempre */ }
}

export function limpiarVistaSuplantada(): void {
  try {
    localStorage.removeItem(MARCA_SUPLANTACION);
    localStorage.removeItem(VENCE_SUPLANTACION);
  } catch { /* nada que limpiar */ }
}

/**
 * Adónde mandar al usuario cuando su sesión de panel se terminó (401 del
 * refresh, /api/auth/me sin sesión, o el reloj de la franja llegó a cero):
 * si era la vista de tienda del superadmin, a su lista de tiendas con el aviso;
 * si no, al login del panel. Consume la marca (no se usa dos veces).
 */
export function destinoSesionTerminada(loginPorDefecto = "/admin/login", ahora = Date.now()): string {
  const slug = leer(MARCA_SUPLANTACION);
  if (!slug) return loginPorDefecto;
  const vence = Number(leer(VENCE_SUPLANTACION));
  limpiarVistaSuplantada();
  if (Number.isFinite(vence) && vence > 0 && ahora > vence + MARGEN_MARCA_VIEJA_MS) return loginPorDefecto;
  return `/superadmin/tenants?${PARAM_VISTA_VENCIDA}=${encodeURIComponent(slug)}`;
}
