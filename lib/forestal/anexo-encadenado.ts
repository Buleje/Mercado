/**
 * A quién le toca el próximo ANEXO N° 04.
 *
 * Emitir los ocho de una tanda fue lo que se descartó a propósito: el anexo es
 * una declaración jurada ante SERFOR y lo que dice lo escribe quien lo firma.
 * Encadenar es lo contrario de automatizar — sigue habiendo una persona por
 * hoja, pero deja de tener que volver a buscar la fila cada vez.
 *
 * Vive acá y no adentro de la vista para poder probarlo: la regla de «cuál
 * sigue» tiene tres casos (el de más abajo, la vuelta al principio, y no queda
 * ninguno) y ninguno se puede ensayar en el navegador sin emitir un anexo de
 * verdad.
 */

export interface LineaDeAnexo {
  id: string;
  /** El número del libro, que es el orden en que se trabaja. */
  lineNo: number;
  status: "registrado" | "anulado";
}

export interface Encadenado<T> {
  /** Cuántas guías vivas del período siguen sin su anexo. */
  pendientes: number;
  /** La que toca ahora, o `null` si no queda ninguna. */
  siguiente: T | null;
}

/**
 * @param lineas   Las del período, como las muestra la vista.
 * @param cerrado  La que se acaba de cerrar (por su número de línea).
 * @param emitidos Ids que YA tienen anexo, recién leídos del servidor.
 */
export function siguienteSinAnexo<T extends LineaDeAnexo>(
  lineas: readonly T[],
  cerrado: { lineNo: number },
  emitidos: ReadonlySet<string>,
): Encadenado<T> {
  /* Una guía anulada no necesita anexo: empujarla sería pedir que se declare
     ante SERFOR un viaje que el libro ya dio de baja. */
  const pendientes = lineas
    .filter((l) => l.status === "registrado" && !emitidos.has(l.id))
    .sort((a, b) => a.lineNo - b.lineNo);
  if (pendientes.length === 0) return { pendientes: 0, siguiente: null };
  /* El siguiente de verdad es el primero por número de línea DESPUÉS del que se
     cerró; si ése era el último, se vuelve al principio — la lista es circular,
     no una fila que se acaba a mitad de camino. */
  const siguiente = pendientes.find((l) => l.lineNo > cerrado.lineNo) ?? pendientes[0];
  return { pendientes: pendientes.length, siguiente };
}
