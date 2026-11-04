/**
 * fichas-tramites-alquileres — contrato compartido de ADR-524.
 *
 * Lo leen las rutas (`app/api/admin/{tramites,alquileres}`, el PATCH del
 * directorio), las pantallas de Administración y la ficha del directorio.
 * Puro y sin `server-only`: lo importa el cliente.
 *
 * Fechas = "AAAA-MM-DD" de Lima; `null` = vacío. Montos con 2 decimales,
 * redondeados en el BACKEND (el cliente solo muestra).
 */

export const ESTADOS_RUC = [
  "activo",
  "baja_oficio",
  "baja_definitiva",
  "baja_provisional",
  "suspension_temporal",
  "otro",
] as const;
export const ESTADOS_CIVILES = ["soltero", "casado", "conviviente", "divorciado", "viudo", "separado"] as const;
export const ENTIDADES_TRAMITE = ["banco", "sunat", "sunarp", "municipalidad", "notaria", "reniec", "otra"] as const;
export const ESTADOS_TRAMITE = [
  "preparando",
  "enviado",
  "observado",
  "aprobado",
  "rechazado",
  "cerrado",
  "desistido",
] as const;
export const ESTADOS_REQUISITO = ["hay", "falta", "no_aplica"] as const;
export const CANALES_TRAMITE = ["presencial", "correo", "web", "whatsapp", "otro"] as const;
export const ESTADOS_ALQUILER = ["negociacion", "vigente", "terminado"] as const;
export const NUESTRO_PAPEL = ["arrendador", "inquilino", "gestor"] as const;
export const MONEDAS = ["PEN", "USD"] as const;
export const MEDIOS_PAGO_ALQUILER = ["transferencia", "deposito", "efectivo", "yape", "plin", "cheque", "otro"] as const;

export type EstadoRuc = (typeof ESTADOS_RUC)[number];
export type EstadoCivil = (typeof ESTADOS_CIVILES)[number];
export type EntidadTramite = (typeof ENTIDADES_TRAMITE)[number];
export type EstadoTramite = (typeof ESTADOS_TRAMITE)[number];
export type EstadoRequisito = (typeof ESTADOS_REQUISITO)[number];
export type CanalTramite = (typeof CANALES_TRAMITE)[number];
export type EstadoAlquiler = (typeof ESTADOS_ALQUILER)[number];
export type NuestroPapel = (typeof NUESTRO_PAPEL)[number];
export type Moneda = (typeof MONEDAS)[number];
export type MedioPagoAlquiler = (typeof MEDIOS_PAGO_ALQUILER)[number];

/** "AAAA-MM-DD" (Lima). */
export type Dia = string;
/** 2 decimales, redondeado en el backend. */
export type Monto = number;

/** Se suman a `Parte` / `ParteInput` (lib/forestal/directorio.ts). */
export interface FichaPersonaCampos {
  dniEmitidoEl: Dia | null;
  dniVenceEl: Dia | null;
  /** RUC aparte del DNI: la persona natural tiene los dos (10 + DNI + dígito). */
  ruc: string | null;
  rucEstado: EstadoRuc | null;
  rucEstadoDesde: Dia | null;
  /** Habido / no habido / no hallado. */
  rucCondicion: string | null;
  nacimientoEl: Dia | null;
  nacimientoLugar: string | null;
  estadoCivil: EstadoCivil | null;
  parentesco: string | null;
}

export interface RequisitoDto {
  id: string;
  orden: number;
  nombre: string;
  estado: EstadoRequisito;
  documentId: string | null;
  documentoNombre: string | null;
  nota: string | null;
}

export interface TramiteDto {
  id: string;
  entidad: EntidadTramite;
  /** «Agrobanco», «Municipalidad de Constitución»… */
  entidadNombre: string | null;
  asunto: string;
  parteId: string | null;
  parteNombre: string | null;
  /** Texto libre cuando la persona no tiene ficha. */
  personaNombre: string | null;
  alquilerId: string | null;
  estado: EstadoTramite;
  iniciadoEl: Dia | null;
  enviadoEl: Dia | null;
  venceEl: Dia | null;
  proximoPaso: string | null;
  proximoPasoEl: Dia | null;
  canal: CanalTramite | null;
  contacto: string | null;
  notas: string | null;
  requisitos: RequisitoDto[];
  /** Lo cuenta el backend. */
  conteo: { hay: number; falta: number; noAplica: number };
  /** Documentos con el tag `tramiteadm:<id>`. */
  documentos: { id: string; nombre: string; codigo: string | null }[];
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlquilerPagoDto {
  id: string;
  /** "AAAA-MM". */
  periodo: string;
  monto: Monto;
  pagadoEl: Dia;
  medio: MedioPagoAlquiler;
  numeroOperacion: string | null;
  comprobanteDocumentId: string | null;
  notas: string | null;
  registradoPor: string;
  createdAt: string;
}

export type TipoAlertaAlquiler = "pago_atrasado" | "pago_incompleto" | "fin_cerca" | "aviso_no_renovar" | "garantia_pendiente";

/** TODO calculado en `lib/admin/alquileres-calculo.ts` (puro, con test). */
export interface AlquilerResumen {
  periodosDelPlazo: number | null;
  periodosPagados: number;
  totalPagado: Monto;
  /** Vencidos y no pagados COMPLETOS: sin pago o pagados en parte (R2). */
  periodosAtrasados: string[];
  /** Meses con un pago menor a la renta: cuánto entró y cuánto falta (R2, calculado acá: el cliente no resta). */
  periodosParciales: { periodo: string; pagado: Monto; falta: Monto }[];
  /** Σ (renta − pagado) de los atrasados, a la renta ACTUAL (R3). */
  deudaAtrasada: Monto;
  proximoPeriodo: string | null;
  proximoVenceEl: Dia | null;
  diasParaFin: number | null;
  avisoNoRenovarEl: Dia | null;
  alertas: { tipo: TipoAlertaAlquiler; texto: string; fecha: Dia }[];
}

export interface AlquilerDto {
  id: string;
  nombre: string;
  direccion: string | null;
  partidaSunarp: string | null;
  manzana: string | null;
  lote: string | null;
  areaM2: number | null;
  ubigeo: string | null;
  duenoParteId: string | null;
  duenoNombre: string | null;
  duenoTexto: string | null;
  inquilinoParteId: string | null;
  inquilinoNombre: string | null;
  inquilinoTexto: string | null;
  nuestroPapel: NuestroPapel | null;
  rentaMensual: Monto;
  moneda: Moneda;
  incluyeImpuestos: boolean | null;
  diaPago: number | null;
  garantiaMonto: Monto | null;
  garantiaPagada: boolean | null;
  garantiaPagadaEl: Dia | null;
  garantiaDevueltaEl: Dia | null;
  inicioEl: Dia;
  finEl: Dia | null;
  renovacionAutomatica: boolean;
  avisoNoRenovarDias: number | null;
  reajuste: string | null;
  contratoDocumentId: string | null;
  cuentaBanco: string | null;
  cuentaCci: string | null;
  cuentaTitular: string | null;
  estado: EstadoAlquiler;
  notas: string | null;
  pagos: AlquilerPagoDto[];
  resumen: AlquilerResumen;
}

/** Cuerpo de `POST /api/admin/alquileres/[id]/pagos`. */
export interface AlquilerPagoInput {
  periodo: string;
  monto: Monto;
  pagadoEl: Dia;
  medio: MedioPagoAlquiler;
  numeroOperacion?: string | null;
  comprobanteDocumentId?: string | null;
  notas?: string | null;
}

/** Cuerpo de `PATCH /api/admin/tramites/[id]/requisitos`. */
export interface RequisitosOps {
  agregar?: { nombre: string; estado?: EstadoRequisito; documentId?: string | null; nota?: string | null }[];
  cambiar?: {
    id: string;
    estado?: EstadoRequisito;
    documentId?: string | null;
    nota?: string | null;
    nombre?: string;
    orden?: number;
  }[];
  quitar?: string[];
}

/** A qué se cuelga un documento subido (`POST /api/admin/documents`, campo `vinculoTipo`). */
export const VINCULOS_DOCUMENTO = ["parte", "tramite", "requisito", "alquiler", "pago_alquiler"] as const;
export type VinculoDocumento = (typeof VINCULOS_DOCUMENTO)[number];

/** Errores: `{ error: CodigoError, message?, issues? }`. */
export type CodigoErrorAdministracion =
  | "invalid_body"
  | "not_found"
  | "periodo_ya_pagado"
  | "periodo_fuera_de_plazo"
  | "parece_clave"
  | "ruc_invalido"
  | "tiene_pagos";
