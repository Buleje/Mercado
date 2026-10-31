/**
 * El panel que gobiernan las secciones Día / Semana / Mes de Asistencia
 * (`BarraDeSecciones` en la fila del título). Cada hoja envuelve su cuerpo
 * —no la cabecera, que lleva la barra— con estas props.
 */
import { idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";

export const ID_PANEL_ASISTENCIA = "rrhh-asistencia-hoja";

export type ModoAsistencia = "dia" | "semana" | "mes";

export function propsPanelAsistencia(modo: ModoAsistencia) {
  return { role: "tabpanel", id: ID_PANEL_ASISTENCIA, "aria-labelledby": idPestanaDeSeccion(ID_PANEL_ASISTENCIA, modo) } as const;
}
