/**
 * Elegir una especie escribiendo su comienzo, como un combo (Brandon 24-10:
 * «Especie con el teclado»): «t» = Tornillo, «cu» = Cumala. Lo usa la celda
 * Especie de la tabla del lote (`celda-especie.tsx`), que es un `<select>` y
 * por eso la flecha se la saltaba.
 *
 * Sin tildes ni mayúsculas: «marupa» encuentra «Marupá». La misma letra
 * repetida recorre las que empiezan con ella («c», «cc», «ccc»: Cedro,
 * Capirona, Cumala…), igual que un `<select>` del navegador.
 */

export function normalizarParaBuscar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** La especie que empieza con lo escrito, en el orden de `opciones`; `null` si ninguna. */
export function especiePorComienzo(opciones: readonly string[], escrito: string): string | null {
  const buscado = normalizarParaBuscar(escrito);
  if (!buscado) return null;
  const directa = opciones.find((o) => normalizarParaBuscar(o).startsWith(buscado));
  if (directa) return directa;
  // «ccc»: la misma letra varias veces recorre las que empiezan con ella.
  const letra = buscado[0];
  if (buscado.length > 1 && [...buscado].every((c) => c === letra)) {
    const conLetra = opciones.filter((o) => normalizarParaBuscar(o).startsWith(letra));
    if (conLetra.length > 0) return conLetra[(buscado.length - 1) % conLetra.length];
  }
  return null;
}
