/**
 * El orden de las columnas de la tabla del cubicador (Brandon, 2026-10-03:
 * «con solo mover o sostener las columnas poder moverlas y cambiarlas de
 * posición»).
 *
 * Sin React: el orden es un arreglo de claves y estas funciones lo leen de lo
 * guardado, lo mueven y arman el pie de la tabla. La casilla de tilde y la
 * columna de acciones NO son parte del orden: quedan fijas en los bordes.
 */

/**
 * Lo guardado, saneado contra las columnas que existen HOY: se descartan las
 * claves desconocidas o repetidas y las nuevas (agregadas después de guardar)
 * entran en su lugar de fábrica, detrás de la que las precede ahí. Sin esto,
 * una columna nueva no aparecería nunca para quien ya había ordenado.
 */
export function normalizarOrden<K extends string>(guardado: unknown, porDefecto: readonly K[]): K[] {
  if (!Array.isArray(guardado)) return [...porDefecto];
  const validas = new Set<string>(porDefecto);
  const orden: K[] = [];
  for (const k of guardado) {
    if (typeof k === "string" && validas.has(k) && !orden.includes(k as K)) orden.push(k as K);
  }
  porDefecto.forEach((k, i) => {
    if (orden.includes(k)) return;
    const previa = porDefecto.slice(0, i).reverse().find((p) => orden.includes(p));
    orden.splice(previa ? orden.indexOf(previa) + 1 : 0, 0, k);
  });
  return orden;
}

/** Saca `clave` y la vuelve a poner justo antes de `antesDe` (al final si es `null`). */
export function moverColumna<K extends string>(orden: readonly K[], clave: K, antesDe: K | null): K[] {
  if (clave === antesDe || !orden.includes(clave)) return [...orden];
  const sin = orden.filter((k) => k !== clave);
  const i = antesDe == null ? -1 : sin.indexOf(antesDe);
  if (i < 0) return [...sin, clave];
  return [...sin.slice(0, i), clave, ...sin.slice(i)];
}

/**
 * Un lugar hacia la izquierda (`-1`) o la derecha (`+1`) entre las columnas que
 * `cuenta` deja ver en la lista — las que no se ofrecen (Código fuera de
 * «Producir sin lote») no gastan un toque de «Subir».
 */
export function desplazarColumna<K extends string>(
  orden: readonly K[],
  clave: K,
  dir: -1 | 1,
  cuenta: (k: K) => boolean = () => true,
): K[] {
  const lista = orden.filter(cuenta);
  const i = lista.indexOf(clave);
  const vecina = lista[i + dir];
  if (i < 0 || vecina === undefined) return [...orden];
  if (dir < 0) return moverColumna(orden, clave, vecina);
  const sin = orden.filter((k) => k !== clave);
  const j = sin.indexOf(vecina);
  return [...sin.slice(0, j + 1), clave, ...sin.slice(j + 1)];
}

export function esOrdenDeFabrica<K extends string>(orden: readonly K[], porDefecto: readonly K[]): boolean {
  return orden.length === porDefecto.length && orden.every((k, i) => k === porDefecto[i]);
}

export type SegmentoPie<K extends string> =
  | { tipo: "total"; clave: K }
  | { tipo: "resto"; span: number; rotulo: boolean };

/**
 * Las celdas del pie de la tabla con las columnas en cualquier orden.
 *
 * Las columnas con total (`conTotal`: m³ y PT) llevan su celda; las demás se
 * juntan en tramos con `colSpan`. El rótulo «Total · N piezas» va en el primer
 * tramo de dos o más columnas (para que no estire la de la casilla), o en el
 * primero si no hay ninguno. `fijasIzq`/`fijasDer`: las columnas fuera del
 * orden (la casilla a la izquierda, las acciones a la derecha).
 */
export function segmentosDelPie<K extends string>(
  visibles: readonly K[],
  conTotal: ReadonlySet<K>,
  fijasIzq = 1,
  fijasDer = 1,
): SegmentoPie<K>[] {
  const segs: SegmentoPie<K>[] = [];
  const sumarResto = (n: number) => {
    const ult = segs[segs.length - 1];
    if (ult?.tipo === "resto") ult.span += n;
    else segs.push({ tipo: "resto", span: n, rotulo: false });
  };
  if (fijasIzq > 0) sumarResto(fijasIzq);
  for (const k of visibles) {
    if (conTotal.has(k)) segs.push({ tipo: "total", clave: k });
    else sumarResto(1);
  }
  if (fijasDer > 0) sumarResto(fijasDer);
  const restos = segs.filter((s): s is Extract<SegmentoPie<K>, { tipo: "resto" }> => s.tipo === "resto");
  const conRotulo = restos.find((s) => s.span >= 2) ?? restos[0];
  if (conRotulo) conRotulo.rotulo = true;
  return segs;
}
