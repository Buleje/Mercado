/**
 * orden-columnas — el orden de las columnas que el operador arrastró (Brandon,
 * 2026-09-26: «que se permita arrastrando cambiar las posiciones de las
 * columnas, así poder personalizarlas»).
 *
 * Puro y sin React: lo usan el hook `useOrdenColumnas` y sus tests. Una tabla
 * declara sus columnas MOVIBLES con un id estable; las fijas (la casilla de
 * marcar, «Acciones») quedan fuera de la lista y la tabla las pinta a los
 * costados como siempre.
 */

/**
 * El orden a pintar: lo guardado, cruzado con las columnas que la tabla tiene
 * HOY.
 *
 * - Un id guardado que la tabla ya no tiene se descarta (una columna que se
 *   borró del código no puede dejar un hueco).
 * - Una columna nueva, que el orden guardado no conoce, entra detrás de la que
 *   la precede en el orden por defecto — no al final: aparecer lejos de su
 *   vecina natural la haría pasar por perdida.
 */
export function fusionarOrden(guardado: readonly string[] | null | undefined, porDefecto: readonly string[]): string[] {
  if (!guardado || guardado.length === 0) return [...porDefecto];
  const validos = new Set(porDefecto);
  const orden = [...new Set(guardado)].filter((id) => validos.has(id));
  porDefecto.forEach((id, i) => {
    if (orden.includes(id)) return;
    // La vecina de la izquierda más cercana que ya esté puesta.
    let j = i - 1;
    while (j >= 0 && !orden.includes(porDefecto[j])) j--;
    const pos = j < 0 ? 0 : orden.indexOf(porDefecto[j]) + 1;
    orden.splice(pos, 0, id);
  });
  return orden;
}

/**
 * Mueve `desde` al lado de `hasta`. `lado` dice si cae antes o después: es la
 * mitad de la cabecera sobre la que se soltó, la misma raya que se ve al
 * arrastrar.
 */
export function moverColumna(
  orden: readonly string[],
  desde: string,
  hasta: string,
  lado: "antes" | "despues",
): string[] {
  if (desde === hasta || !orden.includes(desde) || !orden.includes(hasta)) return [...orden];
  const sin = orden.filter((id) => id !== desde);
  const i = sin.indexOf(hasta);
  sin.splice(lado === "antes" ? i : i + 1, 0, desde);
  return sin;
}

/** Un paso a la izquierda (-1) o a la derecha (+1), entre las columnas VISIBLES. */
export function correrColumna(orden: readonly string[], id: string, paso: -1 | 1, visibles?: readonly string[]): string[] {
  const vista = visibles ? orden.filter((c) => visibles.includes(c)) : [...orden];
  const i = vista.indexOf(id);
  const vecina = vista[i + paso];
  if (i < 0 || !vecina) return [...orden];
  return moverColumna(orden, id, vecina, paso < 0 ? "antes" : "despues");
}

/** ¿El orden difiere del de fábrica? Decide si se ofrece «Restablecer». */
export function ordenCambiado(orden: readonly string[], porDefecto: readonly string[]): boolean {
  return orden.length !== porDefecto.length || orden.some((id, i) => id !== porDefecto[i]);
}
