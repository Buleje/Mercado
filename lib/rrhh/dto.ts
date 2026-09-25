/**
 * dto.ts — whitelist explícita por nivel (ADR-414 §8).
 *
 * El JSON que sale de cada ruta lo arma ACÁ, campo por campo — nunca un
 * `...row` de lo que trajo Prisma. Es la defensa contra que un campo nuevo en
 * el modelo (o un `select` de más) se cuele al nivel `marcar`, que en el
 * panel lo puede ver un almacenero o un cajero.
 *
 * `test: rrhh-dto-nivel.test.ts` fija que el JSON de una marca (nivel
 * `marcar`) NO trae `documento`, `celular`, `direccion`, `contactoEmergencia`,
 * `observaciones` ni `tarifa*` — ninguna clave, ni siquiera `undefined`.
 *
 * PURO: sin Prisma, React ni fetch. Las filas que recibe (`*Row`) son datos ya
 * planos (Decimal → number, Date de Postgres), los arma la DB class.
 */

import { fechaKeyDeDate, horaDeMinutos } from "./fechas";
import { enmascararDocumento } from "./documento";
import {
  GRUPOS_SANGUINEOS,
  TIPOS_DOCUMENTO,
  type AsistenciaDTO,
  type ColaboradorDTO,
  type ColaboradorMinDTO,
  type EstadoAsistencia,
  type EstadoColaborador,
  type GrupoSanguineo,
  type Modalidad,
  type ModalidadPagada,
  type NivelRrhh,
  type PuestoDTO,
  type TarifaDTO,
  type TipoDocumento,
} from "./tipos";

// ── Filas planas que arma la DB class ────────────────────────────────────────

export interface PuestoRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  tarifaModalidad: string | null;
  tarifaMonto: number | null;
  horasJornada: number;
  horaEntrada: string | null;
  toleranciaMin: number;
  orden: number;
}

export interface ColaboradorRow {
  id: string;
  nombre: string;
  apodo: string | null;
  tipoDocumento: string | null;
  documento: string | null;
  celular: string | null;
  direccion: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaCelular: string | null;
  puestoId: string | null;
  puesto: { id: string; nombre: string } | null;
  estado: string;
  fechaIngreso: Date | null;
  fechaCese: Date | null;
  motivoCese: string | null;
  observaciones: string | null;
  fotoUrl: string | null;
  grupoSanguineo: string | null;
  alergias: string | null;
  beneficiarioId: string | null;
  adminUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TarifaRow {
  id: string;
  modalidad: string;
  monto: number;
  horasJornada: number;
  vigenteDesde: Date;
  motivo: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface AsistenciaRow {
  id: string;
  colaboradorId: string;
  fecha: Date;
  estado: string;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
  origen: string;
  marcadoPor: string;
  createdAt: Date;
  deletedAt: Date | null;
  reemplazadaPorId: string | null;
  motivoCorreccion: string | null;
}

// ── Guardas ──────────────────────────────────────────────────────────────────

function esTipoDocumento(v: string | null): v is TipoDocumento {
  return v !== null && (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

function esGrupoSanguineo(v: string | null): v is GrupoSanguineo {
  return v !== null && (GRUPOS_SANGUINEOS as readonly string[]).includes(v);
}

function esModalidadPagada(v: string): v is ModalidadPagada {
  return v === "HORA" || v === "DIA" || v === "SEMANA" || v === "MES";
}

// ── Puestos ──────────────────────────────────────────────────────────────────

/** La tarifa sugerida sólo va en nivel `completo`: en los demás la clave NO existe. */
export function aPuestoDTO(row: PuestoRow, nivel: NivelRrhh, personas: number): PuestoDTO {
  const base: PuestoDTO = {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    horasJornada: row.horasJornada,
    horaEntrada: row.horaEntrada,
    toleranciaMin: row.toleranciaMin,
    orden: row.orden,
    personas,
  };
  if (nivel !== "completo") return base;
  return {
    ...base,
    tarifaSugerida:
      row.tarifaModalidad != null && row.tarifaMonto != null && esModalidadPagada(row.tarifaModalidad)
        ? { modalidad: row.tarifaModalidad, monto: row.tarifaMonto }
        : null,
  };
}

// ── Colaboradores ────────────────────────────────────────────────────────────

/** Nivel `marcar`: sólo lo que hace falta para marcar asistencia. */
/** Sólo los campos que usa: la hoja de asistencia trae personas con un select mínimo (sin foto ni contacto). */
export function aColaboradorMinDTO(
  row: Pick<ColaboradorRow, "id" | "nombre" | "apodo" | "puesto" | "estado" | "fechaIngreso" | "fechaCese">,
): ColaboradorMinDTO {
  return {
    id: row.id,
    nombre: row.nombre,
    apodo: row.apodo,
    puesto: row.puesto,
    estado: row.estado as EstadoColaborador,
    fechaIngreso: row.fechaIngreso ? fechaKeyDeDate(row.fechaIngreso) : null,
    fechaCese: row.fechaCese ? fechaKeyDeDate(row.fechaCese) : null,
  };
}

/**
 * Niveles `gestion` y `completo`. El documento se enmascara en `gestion`
 * (`"•••• 5678"`); celular, dirección, contacto de emergencia y observaciones
 * se ven completos en los dos — el dato sensible es el documento, no el resto.
 * `tarifaVigente` NO lo pone esta función: lo agrega quien arma la ficha
 * (`ColaboradoresDB.ficha`), y sólo si el nivel es `completo`.
 */
export function aColaboradorDTO(row: ColaboradorRow, nivel: Exclude<NivelRrhh, "marcar">): ColaboradorDTO {
  return {
    ...aColaboradorMinDTO(row),
    tipoDocumento: esTipoDocumento(row.tipoDocumento) ? row.tipoDocumento : null,
    documento: nivel === "completo" ? row.documento : enmascararDocumento(row.documento),
    celular: row.celular,
    direccion: row.direccion,
    contactoEmergencia: { nombre: row.contactoEmergenciaNombre, celular: row.contactoEmergenciaCelular },
    observaciones: row.observaciones,
    motivoCese: row.motivoCese,
    fotoUrl: row.fotoUrl,
    grupoSanguineo: esGrupoSanguineo(row.grupoSanguineo) ? row.grupoSanguineo : null,
    alergias: row.alergias,
    beneficiarioId: row.beneficiarioId,
    adminUserId: row.adminUserId,
    creadoEn: row.createdAt.toISOString(),
    actualizadoEn: row.updatedAt.toISOString(),
  };
}

// ── Tarifas ──────────────────────────────────────────────────────────────────

export function aTarifaDTO(row: TarifaRow): TarifaDTO {
  return {
    id: row.id,
    modalidad: row.modalidad as Modalidad,
    monto: row.monto,
    moneda: "PEN",
    horasJornada: row.horasJornada,
    vigenteDesde: fechaKeyDeDate(row.vigenteDesde),
    motivo: row.motivo,
    creadaPor: row.createdBy,
    creadaEn: row.createdAt.toISOString(),
  };
}

// ── Asistencia ───────────────────────────────────────────────────────────────

/**
 * `conHistorial`: sólo `GET /api/rrhh/asistencia/historial` lo pasa en `true`.
 * En ese caso agrega `reemplazada` con el destino de ESTA versión (`null` si
 * sigue viva); en cualquier otra ruta la clave no existe — una marca del día
 * no necesita saber de sí misma que nadie la reemplazó todavía.
 */
export function aAsistenciaDTO(row: AsistenciaRow, conHistorial = false): AsistenciaDTO {
  return {
    id: row.id,
    colaboradorId: row.colaboradorId,
    fecha: fechaKeyDeDate(row.fecha),
    estado: row.estado as EstadoAsistencia,
    entrada: horaDeMinutos(row.entradaMin),
    salida: horaDeMinutos(row.salidaMin),
    refrigerioMin: row.refrigerioMin,
    horas: row.horas,
    nota: row.nota,
    origen: row.origen === "masivo" ? "masivo" : "manual",
    marcadoPor: row.marcadoPor,
    marcadoEn: row.createdAt.toISOString(),
    ...(conHistorial
      ? {
          reemplazada: row.deletedAt
            ? { en: row.deletedAt.toISOString(), por: row.reemplazadaPorId, motivo: row.motivoCorreccion }
            : null,
        }
      : {}),
  };
}
