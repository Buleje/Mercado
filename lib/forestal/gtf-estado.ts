/**
 * En qué momento de su vida está la guía de una línea de despacho (ADR-374).
 *
 * Dos estados y una regla sola: **la guía está emitida cuando tiene número**.
 *
 *   borrador → se guarda y se corrige las veces que haga falta, todavía no es
 *              un documento: no salió de la planta ni lo vio nadie.
 *   emitida  → tiene su correlativo único, ya identifica un traslado ante la
 *              autoridad, y no se toca más.
 *
 * El número es el que asigna `ForestCtpDespachoDB.emitirGtf` con un lock sobre
 * los despachos del tenant, así que no hay dos guías con el mismo ni huecos en
 * la serie.
 *
 * Por qué "tiene número" y no una columna `estado`: el número YA es el hecho
 * que distingue los dos casos —`emitirGtf` lo usa para ser idempotente— y una
 * segunda fuente de verdad sobre lo mismo se desincroniza. Además hace que las
 * líneas viejas, cargadas cuando el número se tipeaba a mano, cuenten como
 * emitidas sin migrar un solo dato: tienen número, luego se declararon.
 *
 * PURO y client-safe: la tabla y el modal deciden con esto qué mostrar, y el
 * endpoint decide con esto qué rechazar.
 */

export type EstadoGuia = "borrador" | "emitida";

export function estadoDeGuia(gtfNumber: string | null | undefined): EstadoGuia {
  return String(gtfNumber ?? "").trim() === "" ? "borrador" : "emitida";
}

/** Una guía emitida es inmutable: es el documento que ampara el traslado. */
export function guiaEditable(gtfNumber: string | null | undefined): boolean {
  return estadoDeGuia(gtfNumber) === "borrador";
}

/** Cómo se llama el estado en pantalla. */
export const ESTADO_GUIA_LABEL: Record<EstadoGuia, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
};

/**
 * Por qué no se puede editar, dicho para quien lo lee en la pantalla.
 *
 * Un botón gris sin motivo manda a adivinar; el motivo acá es una regla del
 * negocio, no una limitación del sistema.
 */
export function motivoNoEditable(gtfNumber: string | null | undefined): string | null {
  return guiaEditable(gtfNumber)
    ? null
    : `La guía ${String(gtfNumber).trim()} ya está emitida: identifica un traslado ante la autoridad y no se puede modificar.`;
}
