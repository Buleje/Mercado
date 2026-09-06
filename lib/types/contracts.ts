/**
 * Tipos compartidos de Contratos (ADR-307).
 *
 * Client-safe a propósito: el módulo de admin, las rutas y el flujo público de
 * firma leen los MISMOS nombres de campo. La versión anterior tenía la UI
 * leyendo `montoTotal`/`clienteDocumento`/`fechaContrato` mientras la API
 * guardaba `monto`/`clienteDoc`/`fecha`, así que todo salía en cero o vacío.
 */

export const CONTRACT_TIPOS = [
  "VENTA",
  "SERVICIO",
  "TRABAJO",
  "PROVEEDOR",
  "DISTRIBUCION",
  "ALQUILER",
  "CONSIGNACION",
  "MUTUO",
  "TRANSPORTE",
  "NDA",
  "FORESTAL",
  "LOCACION",
] as const;
export type ContractTipo = (typeof CONTRACT_TIPOS)[number];

export const CONTRACT_ESTADOS = [
  "BORRADOR",
  "PENDIENTE_FIRMA",
  "VIGENTE",
  "VENCIDO",
  "RENOVADO",
  "TERMINADO",
  "ANULADO",
] as const;
export type ContractEstado = (typeof CONTRACT_ESTADOS)[number];

export const CONTRACT_EVENT_TYPES = [
  "CREADO",
  "EDITADO",
  "PDF_GENERADO",
  "ENVIADO_FIRMA",
  "FIRMADO",
  "RECHAZADO",
  "VENCIMIENTO_AVISADO",
  "RENOVADO",
  "ANULADO",
  "TERMINADO",
  "REVISADO_IA",
] as const;
export type ContractEventType = (typeof CONTRACT_EVENT_TYPES)[number];

export type SignerRol = "EMISOR" | "CONTRAPARTE" | "TESTIGO";
export type SignerEstado = "PENDIENTE" | "FIRMADO" | "RECHAZADO";

export interface DbContractSigner {
  id: string;
  contractId: string;
  orden: number;
  rol: SignerRol;
  nombre: string;
  documento: string;
  telefono: string;
  email: string | null;
  estado: SignerEstado;
  tieneFirma: boolean;
  firmadoEn: string | null;
  enviadoEn: string | null;
  motivoRechazo: string | null;
  createdAt: string;
}

export interface DbContractEvent {
  id: string;
  contractId: string;
  tipo: ContractEventType;
  detalle: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Un hallazgo del revisor de cláusulas. */
export interface ContractRiesgo {
  severidad: "alta" | "media" | "baja";
  titulo: string;
  /** Qué dice el contrato hoy. */
  hallazgo: string;
  /** Qué puede pasar, en criollo. */
  consecuencia: string;
  /** Qué conviene cambiar. */
  sugerencia: string;
  /** Norma peruana relacionada, si aplica. */
  base?: string;
}

export interface ContractRevisionIa {
  revisadoEn: string;
  /** 0-100: qué tan sano está el contrato. */
  puntaje: number;
  resumen: string;
  riesgos: ContractRiesgo[];
  /** Placeholders `[CAMPO]` que quedaron sin rellenar. */
  camposVacios: string[];
  fuente: "ia" | "reglas";
}

export interface DbContract {
  id: string;
  tenantId: string;
  numero: string;
  tipo: ContractTipo;
  estado: ContractEstado;
  clienteNombre: string;
  clienteDoc: string;
  customerId: string | null;
  supplierId: string | null;
  descripcion: string;
  resumen: string;
  monto: number;
  moneda: "PEN" | "USD";
  fechaInicio: string;
  fechaVencimiento: string | null;
  plantillaId: string | null;
  contenido: string;
  datos: Record<string, string> | null;
  clausulas: string[];
  lugarFirma: string;
  condiciones: string;
  documentId: string | null;
  hashSha256: string | null;
  firmadoEn: string | null;
  renovadoDeId: string | null;
  revisionIa: ContractRevisionIa | null;
  creadoPor: string;
  createdAt: string;
  updatedAt: string;
  firmantes: DbContractSigner[];
  eventos: DbContractEvent[];
}

export interface ContractListFilters {
  tipo?: string;
  estado?: string;
  search?: string;
  customerId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateContractInput {
  tipo: ContractTipo;
  estado?: ContractEstado;
  clienteNombre: string;
  clienteDoc?: string;
  customerId?: string | null;
  supplierId?: string | null;
  descripcion?: string;
  resumen?: string;
  monto?: number;
  moneda?: "PEN" | "USD";
  fechaInicio: string;
  fechaVencimiento?: string | null;
  plantillaId?: string | null;
  contenido?: string;
  datos?: Record<string, string> | null;
  clausulas?: string[];
  lugarFirma?: string;
  condiciones?: string;
  renovadoDeId?: string | null;
  creadoPor?: string;
}

export interface UpdateContractInput {
  tipo?: ContractTipo;
  estado?: ContractEstado;
  clienteNombre?: string;
  clienteDoc?: string;
  customerId?: string | null;
  supplierId?: string | null;
  descripcion?: string;
  resumen?: string;
  monto?: number;
  moneda?: "PEN" | "USD";
  fechaInicio?: string;
  fechaVencimiento?: string | null;
  contenido?: string;
  datos?: Record<string, string> | null;
  clausulas?: string[];
  lugarFirma?: string;
  condiciones?: string;
  documentId?: string | null;
  hashSha256?: string | null;
  firmadoEn?: string | null;
  revisionIa?: ContractRevisionIa | null;
}

export interface CreateSignerInput {
  nombre: string;
  documento?: string;
  telefono?: string;
  email?: string | null;
  rol?: SignerRol;
  orden?: number;
}

// ── Etiquetas para la UI (single source) ─────────────────────────────────────

export const TIPO_LABELS: Record<ContractTipo, string> = {
  VENTA: "Compraventa",
  SERVICIO: "Servicios",
  TRABAJO: "Trabajo",
  PROVEEDOR: "Suministro",
  DISTRIBUCION: "Distribución",
  ALQUILER: "Arrendamiento",
  CONSIGNACION: "Consignación",
  MUTUO: "Mutuo / Préstamo",
  TRANSPORTE: "Transporte",
  NDA: "Confidencialidad",
  FORESTAL: "Forestal",
  LOCACION: "Locación de servicios",
};

export const ESTADO_LABELS: Record<ContractEstado, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_FIRMA: "Esperando firma",
  VIGENTE: "Vigente",
  VENCIDO: "Vencido",
  RENOVADO: "Renovado",
  TERMINADO: "Terminado",
  ANULADO: "Anulado",
};

/**
 * Días que faltan para el vencimiento (negativo = ya venció).
 * Compara en fecha local, no en UTC: si no, un vencimiento "hoy" se lee como
 * ayer para quien está en Perú (UTC-5).
 */
export function diasParaVencer(fechaVencimiento: string | null): number | null {
  if (!fechaVencimiento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento);
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc.getTime() - hoy.getTime()) / 86_400_000);
}

/**
 * El estado que se muestra. El estado guardado manda siempre salvo VIGENTE,
 * que se afina con la fecha para distinguir "por vencer" de "vencido" sin
 * esperar a que corra el cron.
 */
export type EstadoVisible = ContractEstado | "POR_VENCER";

export function estadoVisible(c: Pick<DbContract, "estado" | "fechaVencimiento">): EstadoVisible {
  if (c.estado !== "VIGENTE") return c.estado;
  const dias = diasParaVencer(c.fechaVencimiento);
  if (dias === null) return "VIGENTE";
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "POR_VENCER";
  return "VIGENTE";
}

export const ESTADO_VISIBLE_LABELS: Record<EstadoVisible, string> = {
  ...ESTADO_LABELS,
  POR_VENCER: "Por vencer",
};
