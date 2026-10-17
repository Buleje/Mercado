/**
 * secretos-en-url.ts — secretos que viajan en una URL y que no pueden salir a
 * la analítica (PostHog, Vercel Analytics) ni a Sentry, que guardan la URL
 * completa de cada visita, pedido de red y miga (security 10-10, H2; 17-10, T4).
 *
 * 1. En la RUTA (el segmento ES la credencial):
 *   /kiosko/asistencia/<negocio>.<secreto>      → /kiosko/asistencia/[token]
 *   /firmar-adelanto/<token>                    → /firmar-adelanto/[token]   (ADR-491)
 *   /firmar-contrato/<token>                    → /firmar-contrato/[token]
 *   /api/public/adelantos/<token>/firmar        → /api/public/adelantos/[token]/firmar
 *   /api/public/contratos/<token>[/firmar|/pdf] → /api/public/contratos/[token]…
 *
 * 2. En la QUERY, todo parámetro cuyo nombre termina en «token» (`token`,
 *    `threadToken` del chat de invitados, `accessToken` de Hik-Connect,
 *    `access_token`…): `?threadToken=abc&x=1` → `?threadToken=[token]&x=1`.
 *    El stream del chat (`EventSource`) no puede mandar cabeceras: el token del
 *    hilo va en la URL y abre la conversación entera.
 *
 * Sin dependencias: lo cargan el cliente (instrumentation-client, Sentry,
 * Analytics) y el servidor (Sentry).
 */

/* Con `g` para el reemplazo; la prueba usa la de abajo (sin `g`: `.test()` con `g` guarda lastIndex). */
const RUTAS_CON_SECRETO = String.raw`\/(?:kiosko\/asistencia|firmar-adelanto|firmar-contrato|api\/public\/(?:adelantos|contratos))\/`;
const SECRETO_EN_RUTA = new RegExp(String.raw`(${RUTAS_CON_SECRETO})[^/?#"'\s\\]+`, "g");
const HAY_SECRETO_EN_RUTA = new RegExp(String.raw`${RUTAS_CON_SECRETO}[^/?#"'\s\\[]`);
/* `\b` + nombre terminado en «token» + `=`: vale en una URL, una query suelta o dentro de JSON. */
const TOKEN_EN_QUERY = /\b([\w-]*token)=[^&#"'\s\\]+/gi;
const HAY_TOKEN_EN_QUERY = /\b[\w-]*token=[^&#"'\s\\[]/i;

export const MARCA_TACHADO_RUTA = "[token]";

/** ¿El texto lleva un secreto (en la ruta o en la query)? Barato: para no reescribir lo que no hace falta. */
export function haySecretoEnRuta(s: string): boolean {
  return HAY_SECRETO_EN_RUTA.test(s) || HAY_TOKEN_EN_QUERY.test(s);
}

/** Tacha los secretos de rutas públicas y de parámetros `*token=` dentro de un texto (URL, mensaje, JSON). */
export function tacharSecretosDeRuta(s: string): string {
  if (!haySecretoEnRuta(s)) return s;
  return s
    .replace(SECRETO_EN_RUTA, `$1${MARCA_TACHADO_RUTA}`)
    .replace(TOKEN_EN_QUERY, `$1=${MARCA_TACHADO_RUTA}`);
}

/** Tacha en sitio los textos de un objeto plano (propiedades de un evento). Devuelve el mismo objeto. */
export function tacharSecretosEnObjeto<T extends Record<string, unknown>>(obj: T | null | undefined): T | null | undefined {
  if (!obj) return obj;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && haySecretoEnRuta(v)) (obj as Record<string, unknown>)[k] = tacharSecretosDeRuta(v);
  }
  return obj;
}

/** Miga de Sentry (pedido de red, navegación, consola): el texto y cada dato de texto. */
export function tacharMiga<T extends { message?: string; data?: Record<string, unknown> }>(miga: T): T {
  if (typeof miga.message === "string") miga.message = tacharSecretosDeRuta(miga.message);
  tacharSecretosEnObjeto(miga.data);
  return miga;
}

type EventoConUrl = { request?: { url?: string }; transaction?: string };

/**
 * Evento de Sentry entero (error o transacción): la URL puede ir en
 * `request.url`, `request.query_string`, `request.headers.referer`,
 * `transaction`, las migas, los spans (`http.query`, `url.full`) o `extra`.
 * Se tacha sobre el JSON del evento —es lo que Sentry manda— y, si no se puede
 * serializar (referencia circular en `extra`), al menos la URL y la transacción.
 * `sdkProcessingMetadata` (scopes vivos del SDK, se borra antes del envío) queda
 * fuera de la copia y se devuelve tal cual.
 */
export function tacharEventoSentry<T extends EventoConUrl>(event: T): T {
  try {
    const { sdkProcessingMetadata, ...resto } = event as T & { sdkProcessingMetadata?: unknown };
    const json = JSON.stringify(resto);
    if (!haySecretoEnRuta(json)) return event;
    const limpio = JSON.parse(tacharSecretosDeRuta(json)) as T & { sdkProcessingMetadata?: unknown };
    if (sdkProcessingMetadata !== undefined) limpio.sdkProcessingMetadata = sdkProcessingMetadata;
    return limpio;
  } catch {
    if (event.request?.url) event.request.url = tacharSecretosDeRuta(event.request.url);
    if (event.transaction) event.transaction = tacharSecretosDeRuta(event.transaction);
    return event;
  }
}
