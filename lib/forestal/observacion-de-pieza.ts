/**
 * La observación que se le pega a cada pieza del cubicador (Brandon,
 * 2026-09-23): *«añade observación… y que se ponga fijo o desfijo (candado
 * para que se registre continuamente)»*.
 *
 * Es el mismo gesto que el candado de las medidas:
 *
 * - **Sin candado**, la observación va a la PRÓXIMA pieza y se borra sola. Es
 *   el caso de la pieza rajada en medio de una tanda sana: anotarla no puede
 *   dejar marcadas las cuarenta que siguen.
 * - **Con candado**, va a todas las que sigan hasta que se suelte —«para el
 *   cliente López», «segunda»— y sobrevive a recargar la página, como las
 *   medidas fijas.
 *
 * Es texto del cubicado, como el código de la troza: no agrupa piezas en
 * `unificarPorMedida` ni cambia lo que se declara.
 */

export interface ObservacionDeCarga {
  texto: string;
  fija: boolean;
}

export const OBSERVACION_VACIA: ObservacionDeCarga = { texto: "", fija: false };

/** Tope del texto: una nota de patio, no un informe (el `<input>` usa el mismo). */
export const OBSERVACION_MAX = 120;

/**
 * Lo que se le pega a la pieza que entra y cómo queda el campo después.
 *
 * Sin candado se consume: la segunda pieza de la misma frase dictada ya no la
 * lleva. Un texto de puros espacios no es una observación.
 */
export function tomarObservacion(estado: ObservacionDeCarga): {
  valor: string | undefined;
  siguiente: ObservacionDeCarga;
} {
  const valor = estado.texto.trim().slice(0, OBSERVACION_MAX) || undefined;
  if (estado.fija || !valor) return { valor, siguiente: estado };
  return { valor, siguiente: { texto: "", fija: false } };
}

/**
 * Lo guardado en el dispositivo. Sólo se guarda la FIJA —una suelta es para la
 * próxima pieza, no para mañana—, así que cualquier otra cosa vuelve vacía.
 */
export function leerObservacionGuardada(raw: string | null): ObservacionDeCarga {
  if (!raw) return OBSERVACION_VACIA;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return OBSERVACION_VACIA;
    const { texto, fija } = v as Record<string, unknown>;
    if (typeof texto !== "string" || fija !== true || !texto.trim()) return OBSERVACION_VACIA;
    return { texto: texto.slice(0, OBSERVACION_MAX), fija: true };
  } catch {
    return OBSERVACION_VACIA;
  }
}
