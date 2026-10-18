/**
 * Agenda (ADR-501 §3) — las 6 actividades sugeridas que se crean con un clic.
 * Puro: lo usa la pantalla (carril B) para armar el cuerpo del POST.
 *
 * TODAS nacen APAGADAS (`activo: false`): Brandon elige días y la prende. Las horas
 * y días son valores por defecto editables, no datos del negocio.
 */
import type { z } from "zod";
import type { ActividadCrearSchema } from "./schemas";
import type { CanalAgenda, ColorAgenda, FechaKey, FrecuenciaAgenda, ObjetivoActividad, ReglaAgenda } from "./tipos";

export type CuerpoCrearActividad = z.input<typeof ActividadCrearSchema>;

export type IdPlantillaAgenda =
  | "asistencia"
  | "servicio_aserrio"
  | "gastos_ingresos"
  | "adelantos"
  | "cuenta_tercero"
  | "facturas";

export interface PlantillaAgenda {
  id: IdPlantillaAgenda;
  /** Nombre de la actividad; en `cuenta_tercero` lleva `{parte}`. */
  nombre: string;
  descripcion: string;
  regla: ReglaAgenda;
  frecuencia: FrecuenciaAgenda;
  /** 0 = domingo … 6 = sábado. */
  diasSemana: number[];
  diaMes: number | null;
  hora: string | null;
  parametros: Record<string, unknown>;
  canales: CanalAgenda[];
  color: ColorAgenda;
  /** `parte` = hay que elegir la cuenta corriente (una actividad por parte). */
  pideObjetivo: "parte" | null;
}

const LUN_A_SAB = [1, 2, 3, 4, 5, 6];
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export const PLANTILLAS_AGENDA: readonly PlantillaAgenda[] = [
  {
    id: "asistencia",
    nombre: "Marcar la asistencia",
    descripcion: "Se da por hecha sola cuando todos los colaboradores activos tienen su marca del día.",
    regla: "asistencia",
    frecuencia: "semanal",
    diasSemana: LUN_A_SAB,
    diaMes: null,
    hora: "09:00",
    parametros: { minimo: "todos" },
    canales: ["campana"],
    color: "info",
    pideObjetivo: null,
  },
  {
    id: "servicio_aserrio",
    nombre: "Anotar el servicio de aserrío de hoy",
    descripcion: "Se da por hecha sola cuando hay al menos una corrida de producción en el libro ese día.",
    regla: "servicio_aserrio",
    frecuencia: "semanal",
    diasSemana: LUN_A_SAB,
    diaMes: null,
    hora: "17:00",
    parametros: { soloTerceros: false },
    canales: ["campana"],
    color: "success",
    pideObjetivo: null,
  },
  {
    id: "gastos_ingresos",
    nombre: "Registrar gastos e ingresos",
    descripcion: "Se da por hecha sola cuando ese día hay gastos e ingresos anotados.",
    regla: "gastos_ingresos",
    frecuencia: "diaria",
    diasSemana: TODOS_LOS_DIAS,
    diaMes: null,
    hora: "19:00",
    parametros: { que: ["gastos", "ingresos"] },
    canales: ["campana"],
    color: "warning",
    pideObjetivo: null,
  },
  {
    id: "adelantos",
    nombre: "Revisar los adelantos",
    descripcion: "Se da por hecha sola cuando anotas una gestión de cobranza ese día.",
    regla: "adelantos",
    frecuencia: "semanal",
    diasSemana: [1],
    diaMes: null,
    hora: null,
    parametros: {},
    canales: ["campana"],
    color: "info",
    pideObjetivo: null,
  },
  {
    id: "cuenta_tercero",
    nombre: "Revisar la cuenta de {parte}",
    descripcion: "Se marca a mano; te muestra cuántos movimientos tuvo desde tu última revisión.",
    regla: "cuenta_tercero",
    frecuencia: "semanal",
    diasSemana: [1],
    diaMes: null,
    hora: null,
    parametros: {},
    canales: ["campana"],
    color: "neutral",
    pideObjetivo: "parte",
  },
  {
    id: "facturas",
    nombre: "Llevar las facturas al contador",
    descripcion: "Se marca a mano; te muestra la ventana referencial según tu RUC.",
    regla: "facturas",
    frecuencia: "mensual",
    diasSemana: [],
    diaMes: 5,
    hora: null,
    parametros: { modo: "contador" },
    canales: ["campana"],
    color: "warning",
    pideObjetivo: null,
  },
];

export function plantillaPorId(id: string): PlantillaAgenda | null {
  return PLANTILLAS_AGENDA.find((p) => p.id === id) ?? null;
}

/**
 * Cuerpo del POST `/api/admin/agenda/actividades` para una plantilla. Apagada.
 * `cuenta_tercero` exige `objetivo` (la parte); sin ella devuelve null.
 */
export function actividadDePlantilla(
  p: PlantillaAgenda,
  opciones: { hoy: FechaKey; objetivo?: ObjetivoActividad | null },
): CuerpoCrearActividad | null {
  const objetivo = opciones.objetivo ?? null;
  if (p.pideObjetivo && (!objetivo || objetivo.tipo !== p.pideObjetivo)) return null;
  return {
    nombre: (objetivo ? p.nombre.replace("{parte}", objetivo.nombre) : p.nombre).slice(0, 80),
    regla: p.regla,
    objetivo: p.pideObjetivo ? objetivo : null,
    recurrencia: {
      frecuencia: p.frecuencia,
      desde: opciones.hoy,
      hasta: null,
      diasSemana: [...p.diasSemana],
      diaMes: p.diaMes,
      cadaN: null,
    },
    hora: p.hora,
    canales: [...p.canales],
    responsableRol: null,
    parametros: { ...p.parametros },
    color: p.color,
    nota: null,
    activo: false,
  };
}
