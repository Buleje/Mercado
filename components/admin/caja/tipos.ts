/**
 * Tipos y formatos compartidos por la pestaña Caja (Ventas & Caja › Caja).
 * Salieron de `CashRegisterTab.tsx` (2.538 líneas) al partirlo.
 */
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";

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

/**
 * Las secciones de Ventas y caja › Caja, en `?sub=` (2.º nivel; el 1.º es
 * `?vista=caja-registradora`). Se agrupan en dos pestañas, «Hoy» e
 * «Historial» (`secciones.ts`). «Cuadrar» era la pestaña «Cuadrar caja»
 * (`?vista=arqueo`) hasta la ola 3 del panel unificado: el link viejo llega
 * por VISTA_MIGRATION. `movimientos` y `medios` eran bloques apilados de «Hoy»
 * hasta el 10-10; `historial` dejó de ser la tabla de cajas cerradas (repetía
 * la de los cuadres) y ahora ES la de los cuadres.
 */
export const SUBS_CAJA = ["hoy", "movimientos", "medios", "cuadrar", "historial", "reconciliacion", "auditoria"] as const;
export type VistaCaja = (typeof SUBS_CAJA)[number];
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
export const BOTON_PRIMARIO =
  button({ variant: "accent", className: "rounded-xl" });

const UUID = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** «Venta 63a4541a-c2fc-…-9e123b53e916» → «Venta #63a4541a» (M24): el código
 *  completo queda en el `title` y en la búsqueda, no en la celda. */
export function acortarIds(texto: string): string {
  return texto.replace(UUID, "#$1");
}
