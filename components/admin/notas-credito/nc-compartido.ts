import { FileText, Receipt, CreditCard } from "@buleje/design-system/icons";
import { extractIgv } from "@/lib/tax";

/** Tipos, constantes y ayudas de Notas de crédito (antes arriba de NotasCreditoModule). */
// ── Types ─────────────────────────────────────────────────────────────────────

export type NCStatus = "BORRADOR" | "EMITIDA" | "ANULADA";

export type NotaCredito = {
  id: string;
  /** Ya viene formateado del backend (ej. "NC01-0001"). */
  numero: string;
  tenantId: string;
  orderId?: string;
  saleId?: string;
  orderNumero?: string;
  motivoCodigo: string;
  motivoDesc: string;
  monto: number;
  igv: number;
  total: number;
  notas?: string;
  status: NCStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  emitidaPor?: string;
  anuladaPor?: string;
  emitidaAt?: string;
  anuladaAt?: string;
  clienteNombre?: string;
  clienteDocumento?: string;
  items?: Array<{ nombre: string; cantidad: number; precio: number }>;
};

export type SaleDoc = {
  id: string;
  número: string;
  comprobanteTipo: "ticket" | "boleta" | "factura";
  comprobanteNumero: string;
  fecha: string;
  total: number;
  clienteNombre: string;
  clienteDocumento: string;
  items: Array<{
    id: string;
    nombre: string;
    cantidad: number;
    precio: number;
    cantidadDevolver: number;
    selected: boolean;
  }>;
};

export type PickerDocType = "all" | "factura" | "boleta" | "ticket";
export type DocType = "all" | "factura" | "boleta" | "nota_credito";
export type SortField = "numero" | "total" | "createdAt" | "status";
export type SortDir = "asc" | "desc";
export type ViewMode = "table" | "cards" | "kanban";

export type NCTemplate = {
  id: string;
  name: string;
  codigoMotivo: string;
  descripcionMotivo: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_META: Record<NCStatus, { label: string; color: string; bg: string; dot: string }> = {
  BORRADOR: { label: "Borrador", color: "text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", dot: "bg-[var(--rule-mid)]" },
  EMITIDA:  { label: "Emitida",  color: "text-[var(--data-success-500)]", bg: "bg-primary/10", dot: "bg-primary/10" },
  ANULADA:  { label: "Anulada",  color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-100)]", dot: "bg-[var(--data-error-500)]" },
};

export const DOC_STYLE: Record<string, { bg: string; border: string; icon: string; badge: string; label: string; accent: string }> = {
  factura: { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", icon: "\u{1F4CB}", badge: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Factura", accent: "text-[var(--data-success-500)]" },
  boleta:  { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", icon: "\u{1F4C4}", badge: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Boleta", accent: "text-[var(--data-success-500)]" },
  ticket:  { bg: "bg-[var(--data-warning-50)]", border: "border-[var(--data-warning-500)]", icon: "\u{1F3AB}", badge: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", label: "Ticket", accent: "text-[var(--data-warning-500)]" },
};

export const PICKER_TABS: { id: PickerDocType; label: string; icon: string }[] = [
  { id: "all", label: "Todos", icon: "\u{1F4D1}" },
  { id: "factura", label: "Facturas", icon: "\u{1F4CB}" },
  { id: "boleta", label: "Boletas", icon: "\u{1F4C4}" },
  { id: "ticket", label: "Tickets", icon: "\u{1F3AB}" },
];

export const DOC_TYPES: { id: DocType; label: string; icon: React.ElementType; prefix: string }[] = [
  { id: "all", label: "Todos", icon: FileText, prefix: "" },
  { id: "factura", label: "Facturas", icon: Receipt, prefix: "F001" },
  { id: "boleta", label: "Boletas", icon: FileText, prefix: "B001" },
  { id: "nota_credito", label: "Notas de Cr\u00e9dito", icon: CreditCard, prefix: "NC01" },
];

export const MOTIVOS_SUNAT = [
  { code: "01", label: "Anulaci\u00f3n de la operaci\u00f3n", icon: "\u{1F6AB}", desc: "Se cancela toda la operaci\u00f3n" },
  { code: "02", label: "Anulaci\u00f3n por error en el RUC", icon: "\u{1F522}", desc: "RUC incorrecto en el comprobante" },
  { code: "03", label: "Correcci\u00f3n por error en la descripci\u00f3n", icon: "\u270F\uFE0F", desc: "Texto o descripci\u00f3n equivocada" },
  { code: "04", label: "Descuento global", icon: "\u{1F4B0}", desc: "Descuento aplicado al total" },
  { code: "05", label: "Descuento por \u00edtem", icon: "\u{1F3F7}\uFE0F", desc: "Descuento en productos espec\u00edficos" },
  { code: "06", label: "Devoluci\u00f3n total", icon: "\u21A9\uFE0F", desc: "Devuelve todos los productos" },
  { code: "07", label: "Devoluci\u00f3n parcial", icon: "\u{1F4E6}", desc: "Devuelve algunos productos" },
  { code: "08", label: "Bonificaci\u00f3n", icon: "\u{1F381}", desc: "Productos regalados o de cortes\u00eda" },
  { code: "09", label: "Disminuci\u00f3n en el valor", icon: "\u{1F4C9}", desc: "Se reduce el precio original" },
  { code: "10", label: "Otros conceptos", icon: "\u{1F4DD}", desc: "Otro motivo no listado" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getDocIcon(número: string): string {
  if (número.startsWith("F")) return "\u{1F9FE}";
  if (número.startsWith("B")) return "\u{1F4C4}";
  if (número.startsWith("NC")) return "\u{1F4CB}";
  return "\u{1F4CE}";
}

export const PER_PAGE = 15;

/**
 * Base (sin IGV) de lo que suman los ítems elegidos: los precios de la venta ya traen IGV.
 * Si el monto del asistente sigue siendo esta base, la nota viaja CON IGV (`totalConIgv`) y el
 * servidor la parte con la tasa del negocio: el total queda exacto a lo devuelto (09-10).
 */
export function baseDeLosItems(totalConIgv: number): string {
  return (Math.round(extractIgv(totalConIgv).base * 100) / 100).toFixed(2);
}
