/**
 * Tipos compartidos de Recursos Humanos (ADR-414).
 *
 * Client-safe a propósito: el hub, los hooks y las rutas leen los MISMOS
 * nombres de campo (mismo criterio que `lib/types/contracts.ts`). Lo escribe
 * backend PRIMERO — frontend sólo importa tipos, nunca los redefine.
 *
 * Sin Prisma, React ni fetch.
 */

export const ESTADOS_COLABORADOR = ["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO", "CESADO"] as const;
export type EstadoColaborador = (typeof ESTADOS_COLABORADOR)[number];

export const ESTADOS_ASISTENCIA = [
  "PRESENTE",
  "TARDANZA",
  "MEDIO_DIA",
  "FALTA",
  "PERMISO",
  "DESCANSO",
  "VACACIONES",
] as const;
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];

export const MODALIDADES = ["HORA", "DIA", "SEMANA", "MES", "SIN_PAGO"] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export type ModalidadPagada = Exclude<Modalidad, "SIN_PAGO">;

export const TIPOS_DOCUMENTO = ["DNI", "CE", "PASAPORTE", "OTRO"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type NivelRrhh = "completo" | "gestion" | "marcar";

/** "YYYY-MM-DD", día de Lima. */
export type FechaKey = string;

// ── Puestos ──────────────────────────────────────────────────────────────────

export interface PuestoDTO {
  id: string;
  nombre: string;
  descripcion: string | null;
  horasJornada: number;
  orden: number;
  /** Personas no cesadas con este puesto. */
  personas: number;
  /** Sólo nivel completo: en los demás la clave NO viene. */
  tarifaSugerida?: { modalidad: ModalidadPagada; monto: number } | null;
}

// ── Tarifas ──────────────────────────────────────────────────────────────────

export interface TarifaDTO {
  id: string;
  modalidad: Modalidad;
  monto: number;
  moneda: "PEN";
  horasJornada: number;
  vigenteDesde: FechaKey;
  motivo: string | null;
  creadaPor: string;
  creadaEn: string;
}

// ── Colaboradores ────────────────────────────────────────────────────────────

/** Nivel marcar. */
export interface ColaboradorMinDTO {
  id: string;
  nombre: string;
  apodo: string | null;
  puesto: { id: string; nombre: string } | null;
  estado: EstadoColaborador;
  fechaIngreso: FechaKey | null;
  fechaCese: FechaKey | null;
}

/** Niveles gestion y completo. */
export interface ColaboradorDTO extends ColaboradorMinDTO {
  tipoDocumento: TipoDocumento | null;
  /** gestion: «•••• 5678». */
  documento: string | null;
  celular: string | null;
  direccion: string | null;
  contactoEmergencia: { nombre: string | null; celular: string | null };
  observaciones: string | null;
  motivoCese: string | null;
  beneficiarioId: string | null;
  adminUserId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** Sólo completo. */
  tarifaVigente?: TarifaDTO | null;
}

// ── Contratos vinculados ─────────────────────────────────────────────────────

export interface ContratoDeColaboradorDTO {
  id: string;
  numero: string;
  tipo: string;
  estadoVisible: string; // EstadoVisible de lib/types/contracts.ts
  fechaInicio: FechaKey;
  fechaVencimiento: FechaKey | null;
  diasParaVencer: number | null;
  firmantesPendientes: number;
  tienePdf: boolean;
}

// ── Ficha ────────────────────────────────────────────────────────────────────

export interface FichaColaboradorDTO {
  nivel: Exclude<NivelRrhh, "marcar">;
  colaborador: ColaboradorDTO;
  /** Sólo completo, más nueva primero (incluye las SIN_PAGO). */
  tarifas?: TarifaDTO[];
  vinculo: {
    beneficiario: { id: string; nombre: string; documento: string | null } | null;
    /** Mismo documento normalizado, sin vincular. Nunca se vinculan solos. */
    sugeridos: { id: string; nombre: string }[];
    adminUser: { id: string; username: string; role: string } | null;
  };
  /** Sólo completo y con beneficiario vinculado. */
  cuenta?: { adelantosAbiertosPen: number; abiertos: number; otrasMonedas: Record<string, number> } | null;
  contratos: ContratoDeColaboradorDTO[];
  contratosSugeridos: ContratoDeColaboradorDTO[];
  mes: { mes: string; conteo: Record<EstadoAsistencia, number>; sinMarcar: number };
}

// ── Asistencia ───────────────────────────────────────────────────────────────

export interface AsistenciaDTO {
  id: string;
  colaboradorId: string;
  fecha: FechaKey;
  estado: EstadoAsistencia;
  entrada: string | null; // "HH:MM"
  salida: string | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
  origen: "manual" | "masivo";
  marcadoPor: string;
  marcadoEn: string;
  /** Sólo en el historial. */
  reemplazada?: { en: string; por: string | null; motivo: string | null } | null;
}

export interface HojaAsistenciaDTO {
  nivel: NivelRrhh;
  hoy: FechaKey;
  desde: FechaKey;
  hasta: FechaKey;
  /** `desde: null` = sin límite hacia atrás. */
  ventana: { desde: FechaKey | null; hasta: FechaKey };
  colaboradores: ColaboradorMinDTO[]; // vigentes en algún día del rango, orden por nombre
  marcas: AsistenciaDTO[]; // sólo vivas
}

// ── Resumen del hub ──────────────────────────────────────────────────────────

export interface ResumenRrhhDTO {
  nivel: NivelRrhh;
  hoy: FechaKey;
  personal: Record<EstadoColaborador, number>;
  hoyAsistencia: { incluidos: number; conteo: Record<EstadoAsistencia, number>; sinMarcar: number };
  /** gestion y completo. */
  contratos?: { porVencer: number; vencidos: number; activosSinContrato: number };
}

// ── Lo ganado (referencia) ───────────────────────────────────────────────────

export interface TramoGanado {
  desde: FechaKey;
  hasta: FechaKey;
  modalidad: Modalidad;
  monto: number;
  horasJornada: number;
  dias: number;
  /** Σ factor del tramo. */
  factor: number;
  horas: number;
  horasEstimadas: boolean;
  importe: number; // redondeado UNA vez por tramo
}

export interface GanadoPersona {
  colaboradorId: string;
  total: number;
  tramos: TramoGanado[];
  conteo: Record<EstadoAsistencia, number>;
  sinMarcar: FechaKey[]; // sólo días de jornal
  sinTarifa: FechaKey[];
  fueraDePeriodo: FechaKey[];
  avisos: string[];
}

export interface GanadoDTO {
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
  personas: (GanadoPersona & {
    nombre: string;
    puesto: string | null;
    beneficiarioId: string | null;
    adelantos: { abiertosPen: number; abiertos: number } | null;
  })[];
  /** Σ personas[].total, exacta. */
  total: number;
}

// ── Motivos de rechazo de una marca ─────────────────────────────────────────

export type MotivoRechazo =
  | "futuro"
  | "fuera_de_ventana"
  | "antes_del_ingreso"
  | "despues_del_cese"
  | "horas_invalidas"
  | "horas_en_estado_sin_trabajo"
  | "turno_cruza_medianoche"
  | "colaborador_eliminado";
