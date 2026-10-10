/**
 * Tipos y constantes del módulo Fiados («Me deben»). Salieron de FiadosModule
 * (1.449 líneas) al partirlo; FiadosModule los re-exporta para no romper a
 * quien importe `Fiado` desde ahí.
 */
import { Ban, CheckCircle2, Clock, XCircle } from "@buleje/design-system/icons";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import type { MetodoCobro } from "@/lib/fiados/cobro-metodo";

export type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

export type FiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

export type Fiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  /** Límite de crédito del cliente (0 = sin tope). Lo trae GET /api/fiados. */
  customerCreditLimit?: number;
  total: number;
  saldo: number;
  descripcion?: string;
  status: FiadoStatus;
  fechaVence?: string;
  cuotas: FiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

export const STATUS_META: Record<FiadoStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2; variant: BadgeVariant }> = {
  ACTIVO:    { label: "Activo",    color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)]", icon: Clock,        variant: "warning" },
  PAGADO:    { label: "Pagado",    color: "text-[var(--data-success-500)]", bg: "bg-primary/10",                 icon: CheckCircle2, variant: "success" },
  VENCIDO:   { label: "Vencido",   color: "text-[var(--data-error-500)]",   bg: "bg-[var(--data-error-100)]",   icon: XCircle,      variant: "error" },
  CANCELADO: { label: "Cancelado", color: "text-[var(--text-secondary)]",   bg: "bg-[var(--surface-sunken)]",   icon: Ban,          variant: "neutral" },
};

export const PER_PAGE = 10;

/** AdminTabBar: persistencia del orden en `tab-order-${FIADOS_MODULE_ID}`. */
export const FIADOS_MODULE_ID = "fiados";

export const FIADO_VISTAS = ["resumen", "deudores", "cobranza", "analisis"] as const;
export type FiadoTab = (typeof FIADO_VISTAS)[number];

export type ColumnaOrden = "name" | "total" | "saldo" | "fecha";
export type Densidad = "compact" | "normal" | "wide";

/** Un fiado que todavía se debe (ACTIVO o VENCIDO). */
export function estaAbierto(f: Pick<Fiado, "status">): boolean {
  return f.status === "ACTIVO" || f.status === "VENCIDO";
}

export type ReciboData = {
  clienteNombre: string;
  montoPagado: number;
  saldoAnterior: number;
  saldoActual: number;
  fecha: string;
  clientePhone: string;
  /** Medio con que pagó y si el cobro entró a la caja abierta. */
  metodo?: MetodoCobro;
  caja?: "entro" | "sin-caja";
};

/** Lo que pide la ventana de cobro (un fiado o todo lo de un cliente). */
export type DatosCobro = { monto: number; metodo: MetodoCobro; aCaja: boolean; notas: string };
