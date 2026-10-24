/**
 * Guías de remisión: tipos y datos de referencia compartidos por la lista, el
 * detalle y el formulario de «Nueva guía».
 */

export type GuiaStatus = "BORRADOR" | "EMITIDA" | "EN_TRANSITO" | "ENTREGADA" | "ANULADA";

export type GuiaItem = {
  descripcion: string;
  cantidad: number;
  unidad: string;
  pesoUnitario?: number;
  productoId?: string;
};

export type GuiaRemision = {
  id: string;
  /** Ya viene formateado del backend (ej. "T001-0001"). */
  numero: string;
  tenantId: string;
  orderId?: string;
  fechaTraslado: string;
  motivoTraslado: string;
  destinatarioNombre: string;
  destinatarioRuc?: string;
  destinatarioDireccion: string;
  transportistaNombre?: string;
  transportistaRuc?: string;
  vehiculoPlaca?: string;
  transportistaPlaca?: string; // backward compat
  conductorNombre?: string;
  conductorDni?: string;
  bultos?: number;
  documentoRef?: string;
  puntoPartida: string;
  puntoLlegada: string;
  status: GuiaStatus;
  pesoTotal?: number;
  pesoBruto?: number;
  notas?: string;
  items: GuiaItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Resumen = {
  totalMes: number;
  enTransito: number;
  entregadas: number;
  anuladas: number;
  transportistasFrecuentes: Array<{ nombre: string; ruc: string; count: number }>;
};

export type DraftItem = {
  descripcion: string;
  cantidad: string;
  /** Código SUNAT (catálogo 03): `NIU`, `KGM`… El nombre legible sale de `guia-unidades.ts`. */
  unidad: string;
  pesoUnitario: string;
  /** El producto del pedido del que salió la línea (viaja al backend). */
  productoId?: string;
  /** Cómo venía la unidad en el pedido cuando no tiene código SUNAT («porción»): se avisa, no se cambia en silencio. */
  unidadOrigen?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Color de cada estado con tokens del DS: fondo suave + texto `-ink` (AA en claro y oscuro). */
export const STATUS_META: Record<GuiaStatus, { label: string; color: string; bg: string; dot: string }> = {
  BORRADOR:    { label: "Borrador",    color: "text-[var(--text-secondary)]",       bg: "bg-[var(--surface-sunken)]",   dot: "bg-[var(--text-tertiary)]" },
  EMITIDA:     { label: "Emitida",     color: "text-[var(--data-info-ink)]",        bg: "bg-[var(--data-info-100)]",    dot: "bg-[var(--data-info-500)]" },
  EN_TRANSITO: { label: "En tránsito", color: "text-[var(--data-warning-ink)]",     bg: "bg-[var(--data-warning-100)]", dot: "bg-[var(--data-warning-500)]" },
  ENTREGADA:   { label: "Entregada",   color: "text-[var(--data-success-ink)]",     bg: "bg-[var(--data-success-100)]", dot: "bg-[var(--data-success-500)]" },
  ANULADA:     { label: "Anulada",     color: "text-[var(--data-error-ink)]",       bg: "bg-[var(--data-error-100)]",   dot: "bg-[var(--data-error-500)]" },
};

export const ESTADOS_ORDEN = ["BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA"] as const;

export const MOTIVOS = ["VENTA", "TRASLADO ENTRE ALMACENES", "DEVOLUCION", "EXHIBICION", "CONSIGNACION", "OTROS"];

/** Lo que se lee de cada motivo (el valor guardado no cambia). */
export const MOTIVO_ROTULO: Record<string, string> = {
  VENTA: "Venta",
  "TRASLADO ENTRE ALMACENES": "Traslado entre tus locales o almacenes",
  DEVOLUCION: "Devolución",
  EXHIBICION: "Exhibición",
  CONSIGNACION: "Consignación",
  OTROS: "Otro motivo",
};

/** De dónde sale la guía: de un pedido (precarga) o de un traslado sin venta con su motivo. */
export type FuenteGuia = "pedido" | "sin-pedido";
/** Privado = vehículo propio (placa y conductor); público = empresa de transporte (su RUC). */
export type ModalidadGuia = "privado" | "publico";

export const POR_PAGINA = 10;

export function getPlaca(g: GuiaRemision) {
  return g.vehiculoPlaca || g.transportistaPlaca || "";
}

export function emptyItem(): DraftItem {
  return { descripcion: "", cantidad: "1", unidad: "NIU", pesoUnitario: "" };
}

export type FormGuia = {
  fuente: FuenteGuia; modalidad: ModalidadGuia; motivoTraslado: string; destinatarioNombre: string; destinatarioRuc: string;
  destinatarioDireccion: string; transportistaNombre: string; transportistaRuc: string; vehiculoPlaca: string;
  conductorNombre: string; conductorDni: string; bultos: string; documentoRef: string; puntoPartida: string;
  puntoLlegada: string; fechaTraslado: string; pesoBruto: string; notas: string;
};

export const FORM_VACIO: FormGuia = {
  fuente: "pedido", modalidad: "privado", motivoTraslado: "VENTA", destinatarioNombre: "", destinatarioRuc: "", destinatarioDireccion: "",
  transportistaNombre: "", transportistaRuc: "", vehiculoPlaca: "", conductorNombre: "", conductorDni: "",
  bultos: "", documentoRef: "", puntoPartida: "", puntoLlegada: "", fechaTraslado: "", pesoBruto: "", notas: "",
};
