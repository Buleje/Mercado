/**
 * terminos-busqueda — de lo que la persona escribió a lo que hay que buscar.
 *
 * La búsqueda del drive exige que TODAS las palabras estén en el documento. Eso
 * es lo correcto para "alquiler local", pero convierte a "la factura del
 * proveedor de arroz" en cero resultados: ningún documento dice "del". Las
 * palabras de relleno del castellano no dicen nada sobre qué documento es, así
 * que no se buscan.
 *
 * Se comparte entre el servidor (arma el filtro SQL) y la pantalla (resalta el
 * fragmento): si no fuera el mismo criterio, la lista marcaría en amarillo un
 * "de" que no fue el que trajo el documento.
 */

/** Relleno del castellano — no distingue un documento de otro. */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "e", "o", "u", "que", "con", "por", "para", "en", "al", "se",
  "su", "sus", "mi", "mis", "tu", "tus", "lo", "es", "son", "como", "mas", "más",
]);

/**
 * Las palabras que vale la pena buscar. Si TODO lo que escribió es relleno
 * ("de la"), se devuelven tal cual: es mejor buscar algo que no buscar nada.
 */
export function palabrasUtiles(consulta: string): string[] {
  const todas = consulta.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const utiles = todas.filter((w) => !VACIAS.has(w));
  return utiles.length > 0 ? utiles : todas;
}
