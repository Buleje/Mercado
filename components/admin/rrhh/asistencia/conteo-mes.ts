/**
 * conteo-mes.ts — el conteo del mes de UNA persona: cuántos días de cada
 * estado y cuántos sin marcar. Lo usan la tabla de escritorio y el calendario
 * del celular: una sola cuenta para las dos, así no pueden dar distinto.
 *
 * No cuenta el futuro ni los días en que la persona no trabajaba (antes de su
 * ingreso, después de su cese o fuera de ACTIVO) — mismo criterio que la hoja
 * del día (`estaIncluidoEseDia`).
 */

import { estaIncluidoEseDia } from "../rrhh-ui";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

export interface ConteoDelMes {
  conteo: Record<EstadoAsistencia, number>;
  sinMarcar: number;
}

export function conteoDelMes(colaborador: ColaboradorMinDTO, marcasDeLaPersona: AsistenciaDTO[], dias: FechaKey[], hoy: FechaKey): ConteoDelMes {
  const conteo: Record<EstadoAsistencia, number> = { PRESENTE: 0, TARDANZA: 0, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 };
  let sinMarcar = 0;
  for (const d of dias) {
    if (d > hoy) continue;
    if (!estaIncluidoEseDia(colaborador, d)) continue;
    const marca = marcasDeLaPersona.find((m) => m.fecha === d);
    if (marca) conteo[marca.estado] += 1;
    else sinMarcar += 1;
  }
  return { conteo, sinMarcar };
}
