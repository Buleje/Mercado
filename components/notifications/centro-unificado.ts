"use client";

/**
 * El centro único de «lo que falta hacer» + notificaciones (Brandon 20-10:
 * «que se combine con el modal de notificaciones, tanto en lateral como
 * central, todo en uno, priorizando lo que falta hacer y clasificando cada uno»).
 *
 * Lo pinta `AvisoAgendaProgramado` (vive en todo el panel). Quien quiera abrirlo
 * —la campana, un aviso flotante, el atajo N— llama `abrirCentro(vista)`; si en
 * este panel no hay centro único (el negocio no tiene Administración o el rol no
 * lee la agenda) devuelve `false` y el que llamó abre su centro de siempre.
 */

/** `por-hacer` = la agenda; `todas` = todo junto; otra = una categoría de notificaciones. */
export type VistaCentro = "por-hacer" | "todas" | (string & {});

type Abridor = (vista?: VistaCentro) => void;
let abridor: Abridor | null = null;

/** Lo registra quien pinta el centro; devuelve cómo darse de baja. */
export function registrarCentro(fn: Abridor): () => void {
  abridor = fn;
  return () => {
    if (abridor === fn) abridor = null;
  };
}

export function hayCentroUnificado(): boolean {
  return abridor !== null;
}

export function abrirCentro(vista?: VistaCentro): boolean {
  if (!abridor) return false;
  abridor(vista);
  return true;
}
