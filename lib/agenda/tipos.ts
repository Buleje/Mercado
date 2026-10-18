/**
 * Agenda de Administración (ADR-501) — tipos compartidos entre el panel y la API.
 * Sin imports de servidor: lo usan los componentes cliente, las rutas y las DB classes.
 * Validación de entrada: `lib/agenda/schemas.ts` (Zod 4, siempre `safeParse`).
 * Las listas cerradas tienen su CHECK gemelo en
 * `prisma/migrations/20261018_agenda_administracion/migration.sql`: cambiar una = cambiar las dos.
 */
import type { AdminRole } from "@/lib/session";

export const REGLAS_AGENDA = [
  "asistencia",
  "facturas",
  "servicio_aserrio",
  "gastos_ingresos",
  "adelantos",
  "cuenta_tercero",
  "manual",
] as const;
export const FRECUENCIAS_AGENDA = ["una_vez", "diaria", "semanal", "quincenal", "mensual", "cada_n_dias"] as const;
export const CANALES_AGENDA = ["campana", "telegram", "n8n", "reporte_diario", "google"] as const;
export const ESTADOS_MANUALES = ["hecha", "omitida", "pospuesta"] as const;
export const COLORES_AGENDA = ["info", "success", "warning", "error", "neutral"] as const;
/** Qué entra en un feed ICS (CHECK `AgendaFeedIcs_incluye_chk`). */
export const INCLUYE_FEED_ICS = ["actividades", "notas", "tareas", "vencimientos"] as const;
/**
 * Roles que pueden ser `responsableRol` de una actividad: los mismos que leen la agenda
 * (ROLES_LEER_AGENDA de lib/admin/agenda-acceso.ts). Un responsable que no puede abrir
 * la pestaña no tendría dónde marcarla.
 */
export const ROLES_RESPONSABLE_AGENDA = [
  "admin",
  "owner",
  "tienda_owner",
  "manager",
  "cajero",
  "almacenero",
  "analista",
] as const satisfies readonly AdminRole[];

export type ReglaAgenda = (typeof REGLAS_AGENDA)[number];
export type FrecuenciaAgenda = (typeof FRECUENCIAS_AGENDA)[number];
export type CanalAgenda = (typeof CANALES_AGENDA)[number];
export type EstadoManual = (typeof ESTADOS_MANUALES)[number];
export type ColorAgenda = (typeof COLORES_AGENDA)[number];
export type IncluyeFeedIcs = (typeof INCLUYE_FEED_ICS)[number];
export type RolResponsableAgenda = (typeof ROLES_RESPONSABLE_AGENDA)[number];
export type EstadoOcurrencia = EstadoManual | "parcial" | "pendiente" | "atrasada" | "futura";
/** «YYYY-MM-DD» en hora de Lima. */
export type FechaKey = string;

export interface Recurrencia {
  frecuencia: FrecuenciaAgenda;
  desde: FechaKey;
  hasta: FechaKey | null;
  /** 0 = domingo … 6 = sábado (diaria/semanal/quincenal). */
  diasSemana: number[];
  /** 1-31; 31 = último día del mes (mensual). */
  diaMes: number | null;
  cadaN: number | null;
}

export interface ObjetivoActividad {
  tipo: "parte" | "beneficiario";
  id: string;
  nombre: string;
}

export interface ActividadDTO {
  id: string;
  nombre: string;
  regla: ReglaAgenda;
  objetivo: ObjetivoActividad | null;
  recurrencia: Recurrencia;
  hora: string | null;
  canales: CanalAgenda[];
  responsableRol: AdminRole | null;
  parametros: Record<string, unknown>;
  color: ColorAgenda;
  nota: string | null;
  activo: boolean;
  /** ISO de updatedAt: concurrencia optimista en PATCH. */
  version: string;
}

export interface OcurrenciaDTO {
  actividadId: string;
  nombre: string;
  regla: ReglaAgenda;
  fecha: FechaKey;
  hora: string | null;
  estado: EstadoOcurrencia;
  /** fuente = lo dijo el sistema · manual = lo marcó alguien · sin_fuente = regla manual sin marcar */
  origen: "fuente" | "manual" | "sin_fuente";
  detalle: string | null;
  avance: { hecho: number; total: number } | null;
  href: string;
  nota: string | null;
  marcadoPor: string | null;
  posponerA: FechaKey | null;
}

export interface NotaDelDia {
  id: string;
  titulo: string;
  contenido: string;
  color: string;
  fecha: FechaKey;
}

export interface TareaDelDia {
  id: string;
  titulo: string;
  estado: string;
  prioridad: string;
  asignadoA: string | null;
  fecha: FechaKey;
}

export interface VencimientoDelDia {
  id: string;
  origen: "adelanto" | "entrega_pactada" | "promesa_adelanto" | "recordatorio";
  titulo: string;
  fecha: FechaKey;
  href: string;
}

export interface DiaAgenda {
  fecha: FechaKey;
  ocurrencias: OcurrenciaDTO[];
  notas: NotaDelDia[];
  tareas: TareaDelDia[];
  vencimientos: VencimientoDelDia[];
}

export interface AlertaAgenda {
  id: string;
  categoria: "sistema";
  severity: "critical" | "warning";
  title: string;
  description: string;
  action?: { label: string; href: string };
  cantidad?: number;
}

export interface ResumenAgendaHoy {
  fecha: FechaKey;
  hoy: OcurrenciaDTO[];
  atrasadas: OcurrenciaDTO[];
  cuenta: { total: number; hechas: number; pendientes: number; atrasadas: number };
  alertas: AlertaAgenda[];
}

export interface FeedIcsDTO {
  id: string;
  nombre: string;
  pista: string;
  incluye: string[];
  creadoEn: string;
  ultimoUso: string | null;
}

export interface ConexionGoogleDTO {
  email: string;
  estado: "activa" | "revocada" | "error";
  ultimaSync: string | null;
  ultimoError: string | null;
  tareas: boolean;
}
