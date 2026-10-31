/**
 * reparto-colores — el color con el que se reconoce cada bloque de rolliza.
 *
 * Brandon, 2026-09-02: «quiero que cada bloque tenga un color diferente para
 * diferenciarlo; eso también aplica a la tabla Distribución de rolliza sobre
 * lo aserrado, que será igual al color del bloque puesto».
 *
 * La misma fila se lee en DOS lugares —la tabla de arriba, donde se carga, y
 * la tarjeta de abajo, donde se ve qué le tocó—, y hasta ahora la única forma
 * de aparearlas era leer la etiqueta en las dos. El color hace ese apareo de
 * un vistazo.
 *
 * Dos decisiones que no son cosméticas:
 *
 *  1. **El índice sale de la lista MAESTRA de bloques** (`bloques[]`, el orden
 *     en que se cargaron), no de la posición dentro de la especie. El desglose
 *     agrupa por especie, así que el «bloque 1» de Cedro y el «bloque 1» de
 *     Tornillo son filas distintas de la tabla: numerarlos por especie les
 *     daría el mismo color a dos filas que no tienen nada que ver.
 *
 *  2. **El color identifica, no juzga.** Por eso son tokens `--bloque-N` y no
 *     la familia `--data-{warning,error}`: en esta pantalla el ámbar y el rojo
 *     ya significan «esto no cuadra», y pintar el tercer bloque de ámbar lo
 *     haría parecer un problema. Va en franjas y puntos de pocos píxeles,
 *     nunca en texto ni en áreas grandes.
 */

/** Cuántos colores distintos hay antes de repetir. */
export const COLORES_BLOQUE = 6;

/**
 * El color del bloque que está en la posición `indice` de la lista maestra.
 *
 * Con más de seis bloques la paleta vuelve a empezar: seis hues es el máximo
 * que se distingue de un vistazo, y un séptimo color «nuevo» pero parecido
 * engañaría más que repetir uno lejano.
 */
export function colorDeBloque(indice: number | undefined): string {
  if (indice == null || !Number.isFinite(indice) || indice < 0) return "var(--rule-base)";
  return `var(--bloque-${(Math.floor(indice) % COLORES_BLOQUE) + 1})`;
}

/**
 * `id de bloque → posición en la lista maestra`, para que la tarjeta del
 * desglose pueda pedir su color sin conocer el orden de carga.
 */
export function indicesDeBloques(bloques: readonly { id: string }[]): Map<string, number> {
  return new Map(bloques.map((b, i) => [b.id, i]));
}
