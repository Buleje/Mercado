import type { OrderStatus } from "@/lib/jsondb";

export type { OrderStatus };

export interface OrderFilters {
  statuses: Set<OrderStatus>;
  paymentMethod: "" | "yape" | "efectivo";
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
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",
  confirmado: "bg-[var(--accent-soft)] text-[var(--data-success)]",
  en_camino: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  entregado: "bg-[var(--accent-soft)] text-[var(--data-success)]",
  cancelado: "bg-[var(--data-error-100)] text-[var(--data-error)]",
};

// Valid order status transitions — mirrors server-side VALID_TRANSITIONS
export const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export const DRIVERS = ["Juan", "María", "Carlos", "Delivery 1", "Delivery 2", "Delivery 3"];

export const REJECTION_TEMPLATES = [
  "Producto agotado temporalmente",
  "Dirección fuera de zona de cobertura",
  "Monto mínimo no alcanzado",
  "Error en datos del pedido",
  "Cliente solicitó cancelación",
  "Pago no verificado",
];

export const ORD_PER_PAGE = 20;
