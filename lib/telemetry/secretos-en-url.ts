/**
 * secretos-en-url.ts — rutas PÚBLICAS cuyo segmento es un secreto y que no
 * pueden salir a la analítica (PostHog, Vercel Analytics) ni a Sentry, que
 * guardan la URL completa de cada visita (security 10-10, H2).
 *
 *   /kiosko/asistencia/<negocio>.<secreto>      → /kiosko/asistencia/[token]
 *   /firmar-adelanto/<token>                    → /firmar-adelanto/[token]   (ADR-491)
 *   /firmar-contrato/<token>                    → /firmar-contrato/[token]
 *   /api/public/adelantos/<token>/firmar        → /api/public/adelantos/[token]/firmar
 *   /api/public/contratos/<token>[/firmar|/pdf] → /api/public/contratos/[token]…
 *
 * El token ES la credencial (firma un recibo o un contrato): en un panel de
 * analítica, cualquiera con acceso podía abrir el enlace y firmar.
 *
 * Sin dependencias: lo cargan el cliente (instrumentation-client, Sentry,
 * Analytics) y el servidor (Sentry).
 */

/* Con `g` para el reemplazo; la prueba usa la de abajo (sin `g`: `.test()` con `g` guarda lastIndex). */
const RUTAS_CON_SECRETO = String.raw`\/(?:kiosko\/asistencia|firmar-adelanto|firmar-contrato|api\/public\/(?:adelantos|contratos))\/`;
const SECRETO_EN_RUTA = new RegExp(String.raw`(${RUTAS_CON_SECRETO})[^/?#"'\s\\]+`, "g");
const HAY_SECRETO_EN_RUTA = new RegExp(String.raw`${RUTAS_CON_SECRETO}[^/?#"'\s\\[]`);

export const MARCA_TACHADO_RUTA = "[token]";

/** ¿El texto lleva una ruta con secreto? Barato: para no reescribir lo que no hace falta. */
export function haySecretoEnRuta(s: string): boolean {
  return HAY_SECRETO_EN_RUTA.test(s);
}

/** Tacha el secreto de las rutas públicas dentro de un texto (URL, mensaje, JSON). */
export function tacharSecretosDeRuta(s: string): string {
  return haySecretoEnRuta(s) ? s.replace(SECRETO_EN_RUTA, `$1${MARCA_TACHADO_RUTA}`) : s;
}

/** Tacha en sitio los textos de un objeto plano (propiedades de un evento). Devuelve el mismo objeto. */
export function tacharSecretosEnObjeto<T extends Record<string, unknown>>(obj: T | null | undefined): T | null | undefined {
  if (!obj) return obj;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && haySecretoEnRuta(v)) (obj as Record<string, unknown>)[k] = tacharSecretosDeRuta(v);
  }
  return obj;
}
