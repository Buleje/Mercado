/**
 * Los dueños del cubicador: qué se puede ELEGIR y dónde se CREA (Brandon 23-09).
 *
 * Pedido: «quita en el campo de dueño lo de crear ahí mismo: sólo se creará
 * en el modal, y el campo será para escoger las opciones disponibles».
 *
 * Por qué: el campo de la barra de entrada guardaba como «dueño conocido» cada
 * letra que se tipeaba. En el equipo de Brandon quedaron «w», «l» y «lu» —
 * los pedazos de «wasaco» y «LUCHO» — al lado de los nombres de verdad.
 *
 * PURO y client-safe: lo usan la barra de entrada, la celda de la tabla, el
 * dictado («dueño wasaco») y el modal de dueños.
 */

/** «Wasacó » → «wasaco»: sin acentos, sin mayúsculas, sin espacios de más. */
export function claveDueno(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Las opciones para elegir, sin repetir (el primero que aparece gana su forma
 * escrita). El dueño que tiene la pieza o la barra ahora se agrega si falta:
 * sin él, el `<select>` mostraría «Sin dueño» sobre una pieza que sí tiene.
 */
export function opcionesDeDueno(listas: ReadonlyArray<readonly string[]>, actual?: string | null): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  const sumar = (n: string) => {
    const k = claveDueno(n);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    out.push(n.trim());
  };
  for (const l of listas) for (const n of l) sumar(n);
  if (actual) sumar(actual);
  return out;
}

/**
 * Los que parecen quedar a medio escribir: el comienzo de OTRO nombre de la
 * misma lista («l» y «lu» frente a «LUCHO»). Sólo se proponen para borrar —
 * un «Lu» de verdad puede existir, por eso nunca se borran solos.
 */
export function aMedioEscribir(nombres: readonly string[]): string[] {
  const claves = nombres.map(claveDueno);
  return nombres.filter((n, i) => {
    const k = claves[i];
    return !!k && claves.some((otra, j) => j !== i && otra.length > k.length && otra.startsWith(k));
  });
}

/**
 * El dueño que se dictó («dueño wasa…»), buscado SÓLO entre los que ya
 * existen. `null` = no está: se avisa, no se crea (el reconocedor también
 * inventaba nombres a partir de lo que oía mal).
 *
 * Gana el que coincide entero; si no, el único que empieza así. Dos que
 * empiezan igual no se adivinan.
 */
export function duenoDictado(palabra: string, opciones: readonly string[]): string | null {
  const p = claveDueno(palabra);
  if (!p) return null;
  const exacto = opciones.find((o) => claveDueno(o) === p);
  if (exacto) return exacto;
  const empiezan = opciones.filter((o) => claveDueno(o).startsWith(p));
  return empiezan.length === 1 ? empiezan[0] : null;
}

/**
 * Las fichas del Directorio guardadas en el equipo, con la clave de
 * `claveDueno`. Hasta el 23-09 se guardaban por `toLowerCase()`: «lucho pérez»
 * y «lucho perez» eran dos claves, «Usar su ficha» sumaba una segunda entrada y
 * la lista para elegir mostraba la SIN ficha — piezas sin su precio pactado.
 * Lo que no tiene nombre ni id se descarta (JSON viejo o a medio escribir).
 */
export function reclavearFichas(guardado: unknown): Record<string, { id: string; nombre: string }> {
  if (!guardado || typeof guardado !== "object" || Array.isArray(guardado)) return {};
  const out: Record<string, { id: string; nombre: string }> = {};
  for (const f of Object.values(guardado as Record<string, unknown>)) {
    if (!f || typeof f !== "object") continue;
    const { id, nombre } = f as { id?: unknown; nombre?: unknown };
    if (typeof id !== "string" || !id || typeof nombre !== "string") continue;
    const k = claveDueno(nombre);
    if (k) out[k] = { id, nombre };
  }
  return out;
}

/** La parte del Directorio que se llama igual que un nombre escrito a mano, o `null`. */
export function mismoNombreEnDirectorio<P extends { nombre: string }>(nombre: string, partes: readonly P[]): P | null {
  const k = claveDueno(nombre);
  if (!k) return null;
  return partes.find((p) => claveDueno(p.nombre) === k) ?? null;
}
