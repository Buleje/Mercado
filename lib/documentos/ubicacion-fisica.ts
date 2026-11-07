import { z } from "zod";

/**
 * ADR-526 — «Dónde está el original» (Brandon 31-10): en qué archivador y
 * separador está guardado el papel físico. Lo anota la carpeta para todos sus
 * papeles y cada papel lo hereda al marcarse registrado (ADR-516) si no tiene
 * uno propio. Puro: lo usan las rutas, el hook y las pantallas.
 */

/** Tope de largo: una frase como «Archivador Guías 2026 · separador octubre». */
export const UBICACION_FISICA_MAX = 120;

/** Ejemplo que se ve en el campo vacío (modal de la carpeta y «Guardado en» del papel). */
export const EJEMPLO_UBICACION = "Archivador Guías 2026 · separador octubre";

/**
 * El campo en el cuerpo de un PATCH (carpeta o papel). Ausente = no se toca;
 * `null`, `""` o sólo espacios = borrarla; si no, el texto sin espacios de los
 * bordes, de hasta 120 caracteres (más largo → 400, no se recorta a escondidas).
 * Termina en `.optional()`: en Zod 4 un transform sin él vuelve requerida la clave.
 */
export const ubicacionFisicaSchema = z
  .string()
  .trim()
  .max(UBICACION_FISICA_MAX, `Máximo ${UBICACION_FISICA_MAX} caracteres`)
  .nullable()
  .transform((v) => v || null)
  .optional();

/**
 * ADR-526 — el historial del marcado (Ley 29733): los papeles que cambiaron
 * juntos, agrupados por su cambio de ubicación (`{ de, a }`, mismo formato que
 * el PATCH del papel), o `null` en el grupo de los que no cambiaron. Una carpeta
 * entera da un solo grupo: una sola escritura al historial.
 */
export function agruparCambiosDeUbicacion(
  filas: readonly { id: string; ubicacionFisica: string | null; ubicacionAntes: string | null }[],
): { ids: string[]; ubicacionFisica: { de: string | null; a: string | null } | null }[] {
  const grupos = new Map<string, { ids: string[]; ubicacionFisica: { de: string | null; a: string | null } | null }>();
  for (const f of filas) {
    const de = f.ubicacionAntes ?? null;
    const a = f.ubicacionFisica ?? null;
    const cambio = de === a ? null : { de, a };
    const clave = JSON.stringify(cambio);
    const g = grupos.get(clave);
    if (g) g.ids.push(f.id);
    else grupos.set(clave, { ids: [f.id], ubicacionFisica: cambio });
  }
  return [...grupos.values()];
}

/** Lo que se muestra: la ubicación limpia, o `null` si no hay ninguna escrita. */
export function ubicacionLimpia(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? t : null;
}

/**
 * Dónde mirar el original de un papel: la suya, o —si todavía no la tiene— la
 * de su carpeta (marcada como heredada, para decirlo en pantalla).
 */
export function ubicacionDelOriginal(
  doc: { ubicacionFisica?: string | null },
  carpeta?: { ubicacionFisica?: string | null } | null,
): { texto: string; deLaCarpeta: boolean } | null {
  const propia = ubicacionLimpia(doc.ubicacionFisica);
  if (propia) return { texto: propia, deLaCarpeta: false };
  const heredada = ubicacionLimpia(carpeta?.ubicacionFisica);
  return heredada ? { texto: heredada, deLaCarpeta: true } : null;
}
