/**
 * lib/constant-time.ts — comparación de strings en tiempo constante.
 *
 * Módulo PURO (sin `next/server` ni `node:crypto`) para que sea:
 *  - testeable aislado (no arrastra el runtime de Next), y
 *  - importable desde el **Edge runtime** (middleware / `proxy.ts`), donde las
 *    APIs de `node:crypto` (`timingSafeEqual`) NO existen.
 */

/**
 * Compara dos strings en tiempo constante. Recorre TODA la longitud sin
 * early-exit (XOR acumulado), así no filtra por timing en qué posición difieren.
 * El chequeo de longitud previo solo expone el largo (público y fijo en los
 * tokens CSRF: 64 hex chars), nunca el contenido.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
