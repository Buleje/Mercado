/**
 * Qué cambió del tema desde lo último guardado.
 *
 * El servidor MEZCLA `storeTheme` (`{ ...actual, ...lo_enviado }`, app/api/
 * settings/route.ts). Antes Apariencia mandaba el tema ENTERO que cargó al
 * abrir: si mientras tanto otro editor guardó una clave del mismo tema
 * —«Secciones del inicio» (StorefrontEditor, montado en Contacto) guarda
 * `tiendaSections`—, el «Guardar» de Apariencia la pisaba con la copia vieja.
 * Mandando sólo lo que cambió, cada editor toca sus claves (11-10).
 */
export function cambiosDe<T extends object>(guardado: T, actual: T): Partial<T> {
  const cambios: Partial<T> = {};
  for (const k of Object.keys(actual) as (keyof T)[]) {
    if (JSON.stringify(actual[k]) !== JSON.stringify(guardado[k])) cambios[k] = actual[k];
  }
  return cambios;
}

export const cuantos = (o: object) => Object.keys(o).length;
