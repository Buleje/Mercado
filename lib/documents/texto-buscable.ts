/**
 * texto-buscable — cómo se arma el texto contra el que busca el drive.
 *
 * La búsqueda del listado matchea `ocrText`. Si ahí sólo estuviera el texto
 * crudo del archivo, buscar "el contrato del local" no encontraría nada: esas
 * palabras no están escritas en el contrato. Por eso `ocrText` guarda el texto
 * MÁS lo que la IA entendió (descripción, datos clave, entidades, etiquetas) y
 * más lo que escribió el usuario de su puño y letra.
 *
 * El bloque del usuario va SIEMPRE último y con una marca propia: así se puede
 * reemplazar sin volver a leer el archivo, y un re-análisis de la IA no se lo
 * lleva puesto.
 */

/** Marca del bloque escrito por una persona. No traducir ni tocar: se busca. */
export const MARCA_DESC_PROPIA = "\n[Mi descripción] ";

/** Tope de lo que guardamos: más que esto no aporta a la búsqueda y pesa. */
const TOPE = 20000;

export interface PartesBuscables {
  /** Texto crudo extraído del archivo (o transcripción de la foto). */
  texto: string;
  /** Descripción rica escrita por la IA. */
  descripcion?: string;
  keyFacts?: string[];
  entidades?: string[];
  tags?: string[];
  /** Descripción escrita por el usuario (gana en confianza, no reemplaza). */
  descripcionPropia?: string | null;
}

export function construirTextoBuscable(p: PartesBuscables): string {
  const base = [
    p.texto,
    p.descripcion ? `\n\n[Descripción] ${p.descripcion}` : "",
    p.keyFacts?.length ? `\n[Datos] ${p.keyFacts.join("; ")}` : "",
    p.entidades?.length ? `\n[Entidades] ${p.entidades.join(", ")}` : "",
    p.tags?.length ? `\n[Etiquetas] ${p.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return conDescripcionPropia(base, p.descripcionPropia ?? "");
}

/**
 * Pone (o saca) el bloque del usuario al final del texto buscable, sin tocar
 * el resto. Idempotente: llamarlo dos veces deja una sola descripción.
 */
export function conDescripcionPropia(ocrText: string | null | undefined, descripcion: string): string {
  const base = (ocrText ?? "").split(MARCA_DESC_PROPIA)[0];
  const propia = descripcion.trim();
  if (!propia) return base.slice(0, TOPE);
  // El bloque propio entra completo aunque haya que recortar el texto crudo:
  // es lo que la persona eligió decir sobre el archivo.
  const espacio = TOPE - MARCA_DESC_PROPIA.length - propia.length;
  return `${base.slice(0, Math.max(0, espacio))}${MARCA_DESC_PROPIA}${propia}`;
}
