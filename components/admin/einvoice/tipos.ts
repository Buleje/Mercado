/**
 * Tipos y rótulos de Facturas y boletas (EInvoiceTab). Los totales los manda el
 * backend: acá sólo se leen y se muestran.
 */
import { CheckCircle2, Clock, Send, XCircle } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";

export type DocType = "boleta" | "factura" | "nota-credito" | "nota-debito";
export type DocStatus = "emitido" | "aceptado" | "rechazado" | "anulado" | "pendiente";

export type EDocument = {
  id: string;
  serie: string;
  number: string;
  date: string;
  type: DocType;
  status: DocStatus;
  clientName: string;
  clientRUC: string;
  subtotal: number;
  igv: number;
  total: number;
  items: number;
  sunatResponse: string;
  pdfUrl?: string | null;
  relatedDoc?: string;
};

export type EmitForm = {
  orderId: string;
  tipoDoc: "01" | "03";
  clienteNombre: string;
  clienteDni: string;
  clienteRuc: string;
  clienteDireccion: string;
};

export const fmt = (n: number) => "S/ " + formatNumber(n, { min: 2 });

export const TYPE_META: Record<DocType, { label: string; color: string; bg: string }> = {
  boleta:         { label: "Boleta",          color: "text-primary",     bg: "bg-primary/10 dark:bg-primary/15" },
  factura:        { label: "Factura",         color: "text-primary",  bg: "bg-primary/10 dark:bg-primary/15" },
  "nota-credito": { label: "Nota de crédito", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  "nota-debito":  { label: "Nota de débito",  color: "text-[var(--text-secondary)]",  bg: "bg-[var(--surface-sunken)]" },
};

export const STATUS_META: Record<DocStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  emitido:   { label: "Emitido",   color: "text-[var(--data-success-500)]",    icon: Send },
  aceptado:  { label: "Aceptado",  color: "text-[var(--data-success-500)]", icon: CheckCircle2 },
  rechazado: { label: "Rechazado", color: "text-[var(--data-error-500)]",     icon: XCircle },
  anulado:   { label: "Anulado",   color: "text-[var(--text-secondary)]",    icon: XCircle },
  pendiente: { label: "Pendiente", color: "text-[var(--data-warning-500)]",   icon: Clock },
};

/** Las columnas de datos en su orden de fábrica (Ver/PDF es fija, al final). */
export const COLS_EINVOICE = ["serieNro", "fecha", "tipo", "cliente", "total", "estado"] as const;

export const EMPTY_FORM: EmitForm = {
  orderId: "",
  tipoDoc: "03",
  clienteNombre: "",
  clienteDni: "",
  clienteRuc: "",
  clienteDireccion: "",
};

/** Los números que muestra el panel de Indicadores (de las mismas cuentas de antes). */
export interface StatsComprobantes {
  totalEmitted: number;
  totalIGV: number;
  pending: number;
  rejected: number;
  boletas: number;
  facturas: number;
  notas: number;
  total: number;
}

export function calcularStats(docs: readonly EDocument[]): StatsComprobantes {
  const vivos = docs.filter(d => d.status !== "anulado");
  return {
    totalEmitted: vivos.reduce((s, d) => s + d.total, 0),
    totalIGV: vivos.reduce((s, d) => s + d.igv, 0),
    pending: docs.filter(d => d.status === "pendiente").length,
    rejected: docs.filter(d => d.status === "rechazado").length,
    boletas: docs.filter(d => d.type === "boleta").length,
    facturas: docs.filter(d => d.type === "factura").length,
    notas: docs.filter(d => d.type === "nota-credito" || d.type === "nota-debito").length,
    total: docs.length,
  };
}
