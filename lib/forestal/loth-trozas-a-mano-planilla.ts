/**
 * La lista de trozas a mano del despacho con guía como PLANILLA (Brandon 15-10:
 * «moverme con las flechas entre D1, D2 y largo; que lea fila por fila como el
 * cubicador; ordenar con el mayor en D1 y el menor en D2, hacer y deshacer»).
 *
 * Lo que vive acá es lo puro, para probarlo sin pantalla:
 *  - **Ordenar Ø**: intercambia D1 y D2 en las filas donde D2 > D1. Deshacer
 *    devuelve EXACTAMENTE lo de antes y Rehacer lo vuelve a aplicar. El volumen
 *    no se mueve: Smalian SERFOR promedia los dos diámetros (y `medidasDelLibro`
 *    ya guarda el mayor como D1), así que ordenar es cosmético para el número
 *    pero no para quien coteja contra el papel.
 *  - **Corregir una medida** de una fila ya anotada con las mismas reglas que
 *    la fila de alta (`revisarTrozaAMano`).
 *  - **El texto que se lee** de cada fila: «Fila 1: 45, 40, 3 coma 2».
 *
 * PURO y client-safe.
 */
import { textoPorTramos, type PosicionEnLectura } from "./cubicador-bloques-especie";
import { revisarTrozaAMano, TROZAS_POR_GUIA_MAX, type TrozaAMano } from "./loth-trozas-a-mano";

/** Lo mínimo de una fila para ordenar sus diámetros: su clave estable y los dos Ø. */
export interface DiametrosDeFila {
  key: number;
  d1Cm: number;
  d2Cm: number;
}

/**
 * Lo que hizo un «Ordenar»: por fila tocada, los Ø como estaban ANTES. Con eso
 * se deshace (y se rehace) sin depender del orden de la lista ni de las filas
 * agregadas o quitadas después.
 */
export interface CambioDeOrden {
  antes: readonly DiametrosDeFila[];
}

/** ¿La fila tiene el menor en D1? Es la que «Ordenar Ø» daría vuelta. */
export const estaAlReves = (f: Pick<DiametrosDeFila, "d1Cm" | "d2Cm">): boolean => f.d2Cm > f.d1Cm;

/** Cuántas filas daría vuelta «Ordenar Ø» ahora mismo. */
export const filasAlReves = (filas: readonly Pick<DiametrosDeFila, "d1Cm" | "d2Cm">[]): number =>
  filas.filter(estaAlReves).length;

/** Pone el mayor en D1 y el menor en D2 donde estaban al revés. Las demás quedan intactas (mismo objeto). */
export function ordenarDiametros<T extends DiametrosDeFila>(filas: readonly T[]): { filas: T[]; cambio: CambioDeOrden } {
  const antes: DiametrosDeFila[] = [];
  const nuevas = filas.map((f) => {
    if (!estaAlReves(f)) return f;
    antes.push({ key: f.key, d1Cm: f.d1Cm, d2Cm: f.d2Cm });
    return { ...f, d1Cm: f.d2Cm, d2Cm: f.d1Cm };
  });
  return { filas: nuevas, cambio: { antes } };
}

/**
 * Deshace un «Ordenar»: devuelve cada fila tocada a sus Ø de antes. Sólo las que
 * siguen como las dejó el orden — una medida corregida a mano después no se
 * pisa, y una fila quitada no vuelve.
 */
export function deshacerOrden<T extends DiametrosDeFila>(
  filas: readonly T[],
  cambio: CambioDeOrden,
): { filas: T[]; cambiadas: number } {
  const porKey = new Map(cambio.antes.map((a) => [a.key, a]));
  let cambiadas = 0;
  const nuevas = filas.map((f) => {
    const a = porKey.get(f.key);
    if (!a || f.d1Cm !== a.d2Cm || f.d2Cm !== a.d1Cm) return f;
    cambiadas += 1;
    return { ...f, d1Cm: a.d1Cm, d2Cm: a.d2Cm };
  });
  return { filas: nuevas, cambiadas };
}

/** Rehace un «Ordenar» deshecho: vuelve a dar vuelta las filas que siguen como antes. */
export function rehacerOrden<T extends DiametrosDeFila>(
  filas: readonly T[],
  cambio: CambioDeOrden,
): { filas: T[]; cambiadas: number } {
  const porKey = new Map(cambio.antes.map((a) => [a.key, a]));
  let cambiadas = 0;
  const nuevas = filas.map((f) => {
    const a = porKey.get(f.key);
    if (!a || f.d1Cm !== a.d1Cm || f.d2Cm !== a.d2Cm) return f;
    cambiadas += 1;
    return { ...f, d1Cm: a.d2Cm, d2Cm: a.d1Cm };
  });
  return { filas: nuevas, cambiadas };
}

/** Las medidas que se corrigen en la tabla de lo anotado. */
export type MedidaEditable = "d1" | "d2" | "largo" | "cantidad";

const CLAVE: Record<MedidaEditable, "d1Cm" | "d2Cm" | "largoM" | "cantidad"> = {
  d1: "d1Cm",
  d2: "d2Cm",
  largo: "largoM",
  cantidad: "cantidad",
};

/** Un número como se escribe en Perú: «3,2», «45». */
export const numeroConComa = (n: number): string => String(n).replace(".", ",");

/**
 * Revisa lo tipeado en UNA celda de una fila ya anotada, con las reglas de la
 * fila de alta (límites del Cubicador, volumen > 0). La cantidad además no puede
 * pasar el tope de la guía: `otrasTrozas` = las trozas de la guía SIN esta fila.
 */
export function revisarCeldaAMano(
  fila: TrozaAMano,
  campo: MedidaEditable,
  texto: string,
  otrasTrozas: number,
): { ok: true; cambio: Partial<TrozaAMano> } | { ok: false; error: string } {
  const crudo = {
    especie: fila.especie?.trim() || "—",
    d1: numeroConComa(fila.d1Cm),
    d2: numeroConComa(fila.d2Cm),
    largo: numeroConComa(fila.largoM),
    cantidad: String(fila.cantidad),
    [campo]: texto,
  };
  /* Vacía, la fila de alta toma cantidad 1; corrigiendo, vacía es un error. */
  if (campo === "cantidad" && !texto.trim()) return { ok: false, error: "Falta la cantidad" };
  const r = revisarTrozaAMano(crudo);
  if (!r.ok) {
    const error = r.errores[campo] ?? Object.values(r.errores).find(Boolean) ?? "Revisa la medida";
    return { ok: false, error };
  }
  const clave = CLAVE[campo];
  if (clave === "cantidad" && r.troza.cantidad + otrasTrozas > TROZAS_POR_GUIA_MAX) {
    return {
      ok: false,
      error: `La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: en esta fila caben ${Math.max(0, TROZAS_POR_GUIA_MAX - otrasTrozas)}.`,
    };
  }
  return { ok: true, cambio: { [clave]: r.troza[clave] } };
}

/** Un número como se DICE: «3 coma 2» (un «3.2» suelto, la voz lo lee «tres punto dos»). */
export const numeroEnVoz = (n: number): string => String(n).replace(".", " coma ");

/** Una fila anotada tal como la recorre la lectura (`useLecturaEnVoz` pide un `id`). */
export interface FilaEnVoz {
  id: string;
  d1Cm: number;
  d2Cm: number;
  largoM: number;
  cantidad: number;
  especie?: string;
}

/**
 * Lo que se dice de una fila: «Fila 1: 45, 40, 3 coma 2». Con cantidad, «…, 3
 * trozas». La especie, con la regla del cubicador (`textoPorTramos`): se anuncia
 * al entrar a un tramo de la misma especie («Continúa con Tornillo.») y, si la
 * fila va sola, al final.
 */
export function textoDeFilaAMano(fila: FilaEnVoz, pos: PosicionEnLectura<FilaEnVoz>): string {
  return textoPorTramos(fila, pos, (f) => {
    const medidas = `Fila ${pos.indice + 1}: ${numeroEnVoz(f.d1Cm)}, ${numeroEnVoz(f.d2Cm)}, ${numeroEnVoz(f.largoM)}`;
    return f.cantidad > 1 ? `${medidas}, ${f.cantidad} trozas` : medidas;
  });
}
