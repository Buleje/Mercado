/**
 * Traducción de los datos de origen de una GTF de SERFOR a los del libro.
 *
 * Vive acá y no dentro del formulario porque ahora hay DOS consumidores: el alta
 * manual (que precarga campos) y el alta automática del servidor (ADR-312). Si
 * cada uno tuviera su tabla, un ingreso cargado por una vía y otro por la otra
 * podrían quedar con distinto tipo de origen para la misma guía.
 */

/**
 * "Origen del Recurso" de SERFOR → tipo de origen del libro. Sólo los casos
 * inequívocos: si SERFOR dice algo que no mapea, se deja `otro` y que el
 * operador elija, en vez de adivinarle el título habilitante.
 */
export const ORIGEN_SERFOR: Record<string, string> = {
  CONCESION: "concesion",
  "CONCESIÓN": "concesion",
  PERMISO: "comunidad_nativa",
  PLANTACION: "reforestacion",
  "PLANTACIÓN": "reforestacion",
};

/** Compara nombres de lugares: SERFOR los manda en mayúsculas y sin tildes. */
export const sinTildesUp = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/**
 * Las regiones que ofrece el formulario. "Otra" es el escape: una guía de una
 * región que no está en la lista se registra igual, no se rechaza.
 */
export const REGIONS_PE = [
  "Loreto", "Ucayali", "Madre de Dios", "San Martín",
  "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra",
];

/**
 * El departamento que publica SERFOR ("PASCO"), traído al valor del catálogo
 * ("Pasco"). Comparar tal cual fallaba en silencio y el ingreso se guardaba con
 * la región POR DEFECTO para una guía de otra región.
 */
export function regionDeSerfor(departamento: string | null | undefined): string | null {
  const d = (departamento ?? "").trim();
  if (!d) return null;
  return REGIONS_PE.find((r) => sinTildesUp(r) === sinTildesUp(d)) ?? "Otra";
}
