import { Crown, Star, UserPlus, Moon } from "@buleje/design-system/icons";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import { formatNumber } from "@/lib/format";

/** Tipos, ayudas y configuración del CRM de clientes (antes arriba de CRMTab). */
/**
 * Las columnas de datos en su orden de fábrica (la casilla de comparar y las acciones son fijas).
 * 10-10: sin «Rank» (la tabla va ordenada por lo gastado: el puesto ES la fila, y el mejor
 * cliente está en Indicadores) ni «Contacto» (repetía «Último pedido» con otro texto).
 */
export const COLS_CRM_CLIENTES = ["cliente", "telefono", "ultimaCompra", "totalGastado", "credito", "segmento"] as const;

// ── Types ──────────────────────────────────────────────────────────────────

export type Customer = {
  phone: string;
  name: string;
  location?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  loyaltyPoints?: number;
  /** En GET /api/customers = lo que DEBE de fiados (ACTIVO+VENCIDO), no la columna. */
  creditBalance?: number;
  /** Lo que la tienda le debe (devoluciones a crédito): la columna `creditBalance` cruda. */
  saldoAFavor?: number;
  creditLimit?: number;
  tags?: string | null;
  comoLlego?: string | null;
  /**
   * Lo que compró, contado en el servidor (GET /api/customers?compras=1 →
   * CustomersDB.comprasPorCliente): pedidos no cancelados + ventas del POS.
   * `totalSpent` llega pisado con lo gastado de verdad (pedidos entregados +
   * ventas); la columna de la base sólo seguía al POS.
   */
  _orderCount?: number;
  _lastOrder?: string | null;
  /** Compras de los últimos 30 días: frecuencia y «activos». */
  _compras30d?: number;
  /** Las que suman a lo gastado: el divisor del ticket promedio. */
  _cerradas?: number;
  _segment?: Segment;
  _tags?: string[];
};


export type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

/** Cuántas veces compró en los últimos 30 días, en palabras del dueño. */
export type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual" | "sin-compras";

export const FRECUENCIAS: readonly { id: Frecuencia; label: string; ayuda: string }[] = [
  { id: "diario", label: "Diario", ayuda: "20 compras o más en 30 días" },
  { id: "semanal", label: "Semanal", ayuda: "4 a 19 compras en 30 días" },
  { id: "quincenal", label: "Quincenal", ayuda: "2 o 3 compras en 30 días" },
  { id: "mensual", label: "Mensual", ayuda: "1 compra en 30 días" },
  { id: "sin-compras", label: "Sin compras en 30 días", ayuda: "No compró en los últimos 30 días" },
];

/**
 * La frecuencia sale de las compras de los ÚLTIMOS 30 DÍAS (`_compras30d`).
 * Antes se calculaba con todas las compras de siempre bajo el nombre
 * `orders30d`: un cliente con 9 pedidos de hace 5 meses salía «Semanal» y
 * «Perdido» en la misma fila, y «Inactivo» (11) no cuadraba con «Inactivos
 * 30d» (15).
 */
export function frecuenciaDe(c: Customer): Frecuencia {
  const n = c._compras30d ?? 0;
  if (n >= 20) return "diario";
  if (n >= 4) return "semanal";
  if (n >= 2) return "quincenal";
  if (n >= 1) return "mensual";
  return "sin-compras";
}

/** Compró en los últimos 30 días: el criterio de «Activos (30 d)». */
export const esActivo = (c: Customer) => (c._compras30d ?? 0) > 0;

// ── Helpers ────────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return `S/ ${formatNumber(n, 2)}`;
}

/** «hace 5 meses», no «hace 5m»: con la hora al lado, «5m» se leía como cinco minutos. */
export function fmtRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  if (days < 60) return "hace 1 mes";
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
  const anios = Math.floor(days / 365);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

/** El tono de la última compra: reciente, enfriándose o perdida (antes, la columna «Contacto»). */
export function tonoDeUltimaCompra(iso: string | null | undefined): string {
  if (!iso) return "text-[var(--text-tertiary)]";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 7) return "text-[var(--data-success-ink)]";
  if (days < 30) return "text-[var(--data-warning-ink)]";
  if (days < 90) return "text-[var(--data-error-ink)]";
  return "text-[var(--text-tertiary)]";
}

/**
 * Segmento del cliente según cuántas veces compró y hace cuánto.
 *
 * Exportada para test: depende de `_orderCount` / `_lastOrder`, que el
 * componente tiene que LLENAR antes de llamarla. Si llegan vacíos, la primera
 * línea manda a todos a «nuevo» y la segmentación entera queda muerta sin que
 * nada falle — que es justo lo que pasaba.
 */
export function inferSegment(c: Customer): Segment {
  if ((c._orderCount ?? 0) === 0) return "nuevo";
  if (c._lastOrder) {
    const days = Math.floor((Date.now() - new Date(c._lastOrder).getTime()) / 86400000);
    if (days > 90) return "perdido";
  }
  if ((c._orderCount ?? 0) >= 5) return "frecuente";
  if ((c._orderCount ?? 0) >= 2) return "ocasional";
  return "nuevo";
}

// ── Config ─────────────────────────────────────────────────────────────────

export const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string; Icon: React.ElementType; variant: BadgeVariant }> = {
  frecuente: { label: "Frecuente", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", Icon: Crown,    variant: "success" },
  ocasional: { label: "Ocasional", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",     bg: "bg-primary/10 dark:bg-primary/15",     border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",     Icon: Star,     variant: "info" },
  nuevo:     { label: "Nuevo",     color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)] dark:border-[var(--rule-base)]", Icon: UserPlus, variant: "pending" },
  perdido:   { label: "Perdido",   color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",       Icon: Moon,     variant: "error" },
};

export const PAGE_SIZE = 25;
