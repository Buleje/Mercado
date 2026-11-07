/**
 * nota-del-dia.ts — la nota de una persona en un día (23-10), pura.
 *
 * Antes de marcar, la nota vive en `AsistenciaNota` («suelta»); al marcar ese
 * día pasa a `Asistencia.nota` en la misma transacción, y al quitar la marca
 * vuelve a ser suelta. Para quien mira la hoja hay UNA sola nota por día.
 * La nota nunca cuenta en presentes, tardanzas, faltas ni en lo ganado.
 */

import type { AsistenciaDTO, FechaKey, NotaAsistenciaDTO } from "./tipos";

export const NOTA_DIA_MAX = 300;

/** Ley 29733 (revisión 23-10): la nota la ve todo el que marca; el motivo sí, la salud no. */
export const AVISO_NOTA_SIN_SALUD = "Escribe el motivo, no diagnósticos ni datos de salud";

/**
 * La nota con que se escribe la marca cuando ese día ya tenía una suelta. La
 * de la marca manda; si trae otra cosa, se juntan — nunca se pierde lo que se
 * anotó antes de marcar.
 */
export function notaAlMarcar(notaDeLaMarca: string | null, suelta: string | null): string | null {
  const marca = notaDeLaMarca?.trim() || null;
  const previa = suelta?.trim() || null;
  if (!previa) return marca;
  if (!marca || marca.includes(previa)) return marca ?? previa;
  return `${previa} · ${marca}`.slice(0, NOTA_DIA_MAX);
}

/** La nota que se ve: la de la marca si el día está marcado; si no, la suelta. */
export function notaDelDia(marca: Pick<AsistenciaDTO, "nota"> | undefined | null, suelta: Pick<NotaAsistenciaDTO, "nota"> | undefined | null): string | null {
  if (marca) return marca.nota?.trim() || null;
  return suelta?.nota.trim() || null;
}

export function claveNota(colaboradorId: string, fecha: FechaKey): string {
  return `${colaboradorId}|${fecha}`;
}
