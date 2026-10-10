/**
 * Tipos y formatos compartidos por la pestaña Caja (Ventas & Caja › Caja).
 * Salieron de `CashRegisterTab.tsx` (2.538 líneas) al partirlo.
 */
import { formatCurrency, formatDateShort, formatDateTimeShort } from "@/lib/format";

export interface CashMovement {
  id: string;
  cashRegisterId: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  saleId?: string;
  createdAt: string;
  /** Pago de una liquidación: su medio se corrige anulándola, no desde la caja. */
  liquidacionCodigo?: string;
}

export interface CashRegister {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: "abierta" | "cerrada";
  notes?: string;
  movements: CashMovement[];
}

export type VistaCaja = "current" | "history" | "reconcile" | "auditoria";
export type MethodFilter = "all" | "efectivo" | "yape" | "plin" | "tarjeta" | "transferencia";
export type ModalCaja = "abrir" | "cerrar" | "ingreso" | "egreso" | "arqueo" | "guiado" | "tolerancia" | null;

export interface StatsCaja {
  salesEfectivo: number;
  salesDigital: number;
  totalIn: number;
  totalOut: number;
  salesCount: number;
  expectedCash: number;
  fueraDelCajon: string | null;
  hourlyData: number[];
}

export function fmt(n: number) {
  return `${formatCurrency(n)}`;
}

export function fmtDate(iso: string) {
  try {
    return formatDateTimeShort(iso);
  } catch {
    return iso;
  }
}

export function fmtDateShort(iso: string) {
  try {
    return formatDateShort(iso);
  } catch {
    return iso;
  }
}

export const MOVEMENT_COLORS: Record<string, string> = {
  venta: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12",
  ingreso: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12",
  egreso: "text-[var(--data-error-500)] bg-[var(--data-error-50)]",
  apertura: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]",
  cierre: "text-[var(--text-secondary)] dark:text-muted bg-[var(--surface-sunken)] dark:bg-accent",
};

/** Movimientos que suman (los demás restan o no mueven plata). */
export const TIPOS_QUE_SUMAN = ["venta", "ingreso", "apertura"];

/** +1 suma al cajón, −1 resta, 0 no mueve plata (cierre, arqueo: sólo dejan constancia). */
export function signoDe(type: string): 1 | -1 | 0 {
  if (TIPOS_QUE_SUMAN.includes(type)) return 1;
  return type === "egreso" ? -1 : 0;
}

export const COLOR_SIGNO = {
  "1": "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  "-1": "text-[var(--data-error-500)]",
  "0": "text-[var(--text-secondary)]",
} as const;

/** Clases de botón compartidas: misma altura y tono en toda la pestaña. */
export const BOTON_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 px-3 min-h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] text-sm font-semibold text-[var(--text-secondary)] transition-colors";
export const BOTON_PRIMARIO =
  "inline-flex items-center justify-center gap-1.5 px-4 min-h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors";
