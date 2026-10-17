import { FileText, Receipt, CreditCard, Ticket, ClipboardList, Ban, Hash, Pencil, Wallet, Tag, Undo2, Package, Gift, TrendingDown, type LucideIcon } from "@buleje/design-system/icons";
import { extractIgv } from "@/lib/tax";
import { limaDateKey } from "@/lib/utils";

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
  /** Celular del cliente, si la venta lo guardó: también se busca por él. */
  telefono?: string;
  items: Array<{
    id: string;
    nombre: string;
    cantidad: number;
    precio: number;
    cantidadDevolver: number;
    selected: boolean;
  }>;
};

const sinTildes = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/#/g, "").trim();

/**
 * Buscar la venta de origen de la nota: código («#a1b2c3»), DNI/RUC, celular,
 * monto («45.50» o «45,50»), fecha («15/10») o producto. `/api/sales` no lee
 * `search` (auditoría de comprobantes B5, 17-10): antes el buscador mandaba
 * `?search=` y siempre volvían las mismas 24 ventas. Cada palabra tiene que
 * aparecer en algún dato.
 */
export function buscarVentas(docs: readonly SaleDoc[], consulta: string): SaleDoc[] {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [...docs];
  return docs.filter((d) => {
    const key = Number.isFinite(Date.parse(d.fecha)) ? limaDateKey(d.fecha) : "";
    const fecha = key ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : "";
    const pajar = sinTildes(
      [
        d.id, d.número, d.comprobanteNumero, d.comprobanteTipo, d.clienteNombre, d.clienteDocumento,
        d.telefono ?? "", d.total.toFixed(2), d.total.toFixed(2).replace(".", ","), fecha,
        ...d.items.map((it) => it.nombre),
      ].join(" "),
    );
    return palabras.every((w) => pajar.includes(w));
  });
}

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

export const DOC_STYLE: Record<string, { bg: string; border: string; icon: LucideIcon; badge: string; label: string; accent: string }> = {
  factura: { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", icon: Receipt, badge: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Factura", accent: "text-[var(--data-success-500)]" },
  boleta:  { bg: "bg-primary/10", border: "border-[var(--data-success-500)]/30", icon: FileText, badge: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", label: "Boleta", accent: "text-[var(--data-success-500)]" },
  ticket:  { bg: "bg-[var(--data-warning-50)]", border: "border-[var(--data-warning-500)]", icon: Ticket, badge: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", label: "Ticket", accent: "text-[var(--data-warning-500)]" },
};

export const PICKER_TABS: { id: PickerDocType; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Todos", icon: ClipboardList },
  { id: "factura", label: "Facturas", icon: Receipt },
  { id: "boleta", label: "Boletas", icon: FileText },
  { id: "ticket", label: "Tickets", icon: Ticket },
];

export const DOC_TYPES: { id: DocType; label: string; icon: React.ElementType; prefix: string }[] = [
  { id: "all", label: "Todos", icon: FileText, prefix: "" },
  { id: "factura", label: "Facturas", icon: Receipt, prefix: "F001" },
  { id: "boleta", label: "Boletas", icon: FileText, prefix: "B001" },
  { id: "nota_credito", label: "Notas de Cr\u00e9dito", icon: CreditCard, prefix: "NC01" },
];

export const MOTIVOS_SUNAT = [
  { code: "01", label: "Anulaci\u00f3n de la operaci\u00f3n", icon: Ban, desc: "Se cancela toda la operaci\u00f3n" },
  { code: "02", label: "Anulaci\u00f3n por error en el RUC", icon: Hash, desc: "RUC incorrecto en el comprobante" },
  { code: "03", label: "Correcci\u00f3n por error en la descripci\u00f3n", icon: Pencil, desc: "Texto o descripci\u00f3n equivocada" },
  { code: "04", label: "Descuento global", icon: Wallet, desc: "Descuento aplicado al total" },
  { code: "05", label: "Descuento por \u00edtem", icon: Tag, desc: "Descuento en productos espec\u00edficos" },
  { code: "06", label: "Devoluci\u00f3n total", icon: Undo2, desc: "Devuelve todos los productos" },
  { code: "07", label: "Devoluci\u00f3n parcial", icon: Package, desc: "Devuelve algunos productos" },
  { code: "08", label: "Bonificaci\u00f3n", icon: Gift, desc: "Productos regalados o de cortes\u00eda" },
  { code: "09", label: "Disminuci\u00f3n en el valor", icon: TrendingDown, desc: "Se reduce el precio original" },
  { code: "10", label: "Otros conceptos", icon: FileText, desc: "Otro motivo no listado" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export const PER_PAGE = 15;

/**
 * Base (sin IGV) de lo que suman los ítems elegidos: los precios de la venta ya traen IGV.
 * Si el monto del asistente sigue siendo esta base, la nota viaja CON IGV (`totalConIgv`) y el
 * servidor la parte con la tasa del negocio: el total queda exacto a lo devuelto (09-10).
 */
export function baseDeLosItems(totalConIgv: number): string {
  return (Math.round(extractIgv(totalConIgv).base * 100) / 100).toFixed(2);
}
