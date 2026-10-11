/**
 * Tipos y tablas de Recepciones (Compras › Órdenes y recepción › Recepciones).
 * Salieron de `ReceivingTab` (887 líneas) el 10-10, sin cambiar qué se guarda.
 */
import { formatDate } from "@/lib/format";

import { useOrdenColumnas, EnOrden, BotonRestablecerColumnas } from "@/components/admin/shared/columnas-ordenables";

export interface PendingOC {
  id: string;
  supplierId?: string;
  supplierName?: string;
  status?: string;
  total?: number;
  createdAt?: string;
  items?: Array<{ productId?: number; name?: string; quantity?: number; unit?: string; unitCost?: number }>;
}

export type ReceptionStatus = "programada" | "en-proceso" | "aceptada" | "parcial" | "rechazada";

export type ItemCondition = "ok" | "dañado" | "vencido" | "faltante";

export type ReceptionItem = {
  product: string;
  productId?: number;
  expectedQty: number;
  receivedQty: number;
  condition: ItemCondition;
  notes: string;
  /** «Vence» de lo que llegó (YYYY-MM-DD). Con fecha, lo que entra a stock nace como lote. */
  expiryDate?: string;
  /** Lote del proveedor; sin él, el lote lleva la referencia de la recepción. */
  lote?: string;
};

export type Reception = {
  id: string;
  ref: string;
  orderRef: string;
  supplier: string;
  scheduledDate: string;
  receivedDate?: string;
  status: ReceptionStatus;
  inspector: string;
  items: ReceptionItem[];
  photos: number;
  nonConformities: number;
  invoiceUrl?: string;
};

export const STATUS_MAP: Record<ReceptionStatus, { label: string; color: string; bg: string }> = {
  programada:   { label: "Programada",  color: "text-[var(--data-success-ink)]",    bg: "bg-primary/10 dark:bg-primary/15" },
  "en-proceso": { label: "En proceso",  color: "text-[var(--data-warning-ink)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  aceptada:     { label: "Aceptada",    color: "text-[var(--data-success-ink)]", bg: "bg-primary/10 dark:bg-primary/15" },
  parcial:      { label: "Parcial",     color: "text-[var(--data-warning-ink)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  rechazada:    { label: "Rechazada",   color: "text-[var(--data-error-ink)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

// `opcion`: cómo se lee en el selector. «Faltante» baja la deuda y cierra la
// línea de la orden: no sirve para «llega mañana».
export const COND_MAP: Record<ItemCondition, { label: string; color: string; bg: string; opcion?: string }> = {
  ok:       { label: "OK",       color: "text-[var(--data-success-ink)]", bg: "bg-primary/10 dark:bg-primary/15" },
  "dañado": { label: "Dañado",   color: "text-[var(--data-error-ink)]",     bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20" },
  vencido:  { label: "Vencido",  color: "text-[var(--data-warning-ink)]",  bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  faltante: { label: "Faltante", opcion: "Faltante (no llegará)", color: "text-[var(--data-warning-ink)]",   bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
};

export function fmtDate(iso: string) {
  if (!iso) return "—";
  return formatDate(iso);
}

export const EMPTY_CHECKLIST: ReceptionItem = { product: "", expectedQty: 0, receivedQty: 0, condition: "ok", notes: "" };

/** Lo que no llegó como se pidió: condición distinta de OK o cantidad distinta de la esperada. */
export const getDiscrepancies = (items: ReceptionItem[]) =>
  items.filter(it => it.condition !== "ok" || it.receivedQty !== it.expectedQty);
