import { Crown, Star, UserPlus, Moon } from "@buleje/design-system/icons";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import { formatNumber } from "@/lib/format";

/** Tipos, ayudas y configuración del CRM de clientes (antes arriba de CRMTab). */
/** Las columnas de datos en su orden de fábrica (la casilla de comparar y «Ver» son fijas). */
export const COLS_CRM_CLIENTES = ["rank", "cliente", "telefono", "ultimoPedido", "totalGastado", "credito", "segmento", "contacto"] as const;

// ── Types ──────────────────────────────────────────────────────────────────

export type Customer = {
  phone: string;
  name: string;
  location?: string;
  loyaltyTier?: string;
  totalSpent?: number;
  loyaltyPoints?: number;
  creditBalance?: number;
  creditLimit?: number;
  tags?: string | null;
  comoLlego?: string | null;
  // Populated client-side from /orders
  _orderCount?: number;
  _lastOrder?: string | null;
  _segment?: Segment;
  _tags?: string[];
};


export type QuickFilter = "todos" | "activos" | "inactivos" | "con-deuda";

export type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

export type FrequencyFilter = "todos-freq" | "diario" | "semanal" | "quincenal" | "mensual" | "inactivo-freq";

// ── Helpers ────────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return `S/ ${formatNumber(n, 2)}`;
}

export function fmtRelative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
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
