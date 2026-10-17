import type { OrderStatus } from "@/lib/jsondb";

export type { OrderStatus };

export type OrderSource = "" | "direct" | "marketplace";

export interface OrderFilters {
  statuses: Set<OrderStatus>;
  paymentMethod: "" | "yape" | "efectivo";
  source: OrderSource;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  customerSearch: string;
  hasDebt: boolean;
  hasAdminNotes: boolean;
}

export type FiltersAction =
  | { type: "SET_STATUSES"; statuses: Set<OrderStatus> }
  | { type: "SET_PAYMENT_METHOD"; value: "" | "yape" | "efectivo" }
  | { type: "SET_SOURCE"; value: OrderSource }
  | { type: "SET_DATE_FROM"; value: string }
  | { type: "SET_DATE_TO"; value: string }
  | { type: "SET_AMOUNT_MIN"; value: string }
  | { type: "SET_AMOUNT_MAX"; value: string }
  | { type: "SET_CUSTOMER_SEARCH"; value: string }
  | { type: "SET_HAS_DEBT"; value: boolean }
  | { type: "SET_HAS_ADMIN_NOTES"; value: boolean }
  | { type: "CLEAR" };

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/**
 * Cómo se dice cada medio de pago, en UNA tabla (tarjeta, lista y detalle).
 * Antes la tarjeta y la cabecera del detalle decían «Efectivo» para todo lo
 * que no fuera Yape: un pedido con Plin o transferencia salía como efectivo.
 */
const METODO_PAGO: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
  efectivo: "Efectivo",
  fiado: "Fiado",
  tarjeta: "Tarjeta",
  cash: "Efectivo",
  marketplace: "Marketplace",
};

export function nombreDelPago(metodo: string | null | undefined): string {
  return metodo ? (METODO_PAGO[metodo] ?? metodo) : "";
}

/** Texto en `-ink` (10-10): el `-500` sobre su fondo claro daba ~2:1 en 14 px. Mismo color que la columna del tablero. */
export const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]",
  confirmado: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  preparando: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]",
  en_camino: "bg-[var(--data-info-500)]/10 text-[var(--data-info-ink)]",
  entregado: "bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]",
  cancelado: "bg-[var(--data-error-100)] text-[var(--data-error-ink)]",
};

// Valid order status transitions — mirrors server-side VALID_TRANSITIONS
// FIX 2026-05-07: confirmado/preparando pueden saltar a "entregado" directo
// (entrega manual mostrador, cliente vino a recoger, sin delivery).
export const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["preparando", "en_camino", "entregado", "cancelado"],
  preparando: ["en_camino", "entregado", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export const REJECTION_TEMPLATES = [
  "Producto agotado temporalmente",
  "Dirección fuera de zona de cobertura",
  "Monto mínimo no alcanzado",
  "Error en datos del pedido",
  "Cliente solicitó cancelación",
  "Pago no verificado",
];

export const ORD_PER_PAGE = 20;
