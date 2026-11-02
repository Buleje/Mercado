/**
 * lib/mcp-servidor/rutas.ts — Buleje IA (ADR-528), carril 4.
 *
 * Las DOS rutas del servidor MCP del negocio, dichas una sola vez. Las usa el
 * proxy (para eximirlas del CSRF: no hay cookie de sesión que abusar, entran con
 * su propio token) y los tests. Puro y sin imports: corre en el Edge.
 *
 * Lista blanca EXACTA, nunca un prefijo: `startsWith("/api/mcp")` también
 * eximía `/api/mcpx`, `/api/mcp/lo-que-sea` y lo que Next resolviera de un
 * `..` codificado (memoria `filtro-rutas-lista-negra-se-evade`). El token de la
 * ruta solo puede traer letras base64url: sin `%`, `.`, `/` ni `\`, así que un
 * `%2e%2e` o un `%252e%252e` no matchea y sigue por el CSRF normal.
 */

/** `/api/mcp` (token en `Authorization: Bearer`). */
export const RUTA_MCP = "/api/mcp";

/** Prefijo de `/api/mcp/t/<token>` (para apps que solo aceptan una URL). */
export const RUTA_MCP_CON_TOKEN = "/api/mcp/t/";

/** Lo que puede traer el segmento del token: `bul_mcp_` + base64url. Tope de largo holgado. */
const SEGMENTO_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * ¿Esta ruta es el servidor MCP? Compara con mayúsculas y minúsculas tal cual:
 * `/API/MCP` no es la ruta (Next tampoco la sirve).
 */
export function esRutaMcp(pathname: string): boolean {
  if (pathname === RUTA_MCP) return true;
  if (!pathname.startsWith(RUTA_MCP_CON_TOKEN)) return false;
  return SEGMENTO_TOKEN.test(pathname.slice(RUTA_MCP_CON_TOKEN.length));
}
