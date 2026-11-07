import type { DbPurchaseOrder, PurchaseStatus } from "@/lib/jsondb";
import type { SeguimientoOC, Tono } from "@/lib/compras/ciclo-oc";
import { ESTADO_OC_LABELS } from "@/lib/compras/estados-oc";

/** Constantes y piezas chicas de Órdenes de compra (antes arriba de PurchaseOrdersTab). */
// Labels y transiciones salen de lib/compras/estados-oc.ts — la misma tabla
// que valida el endpoint. Antes este select ofrecía "Auto-generado", que el
// servidor rechaza con 400.
export const STATUS_LABELS = ESTADO_OC_LABELS as Record<PurchaseStatus, string>;
/* Texto con `-ink` (09-10): el `-500` sobre su propio tinte no llega a 4,5:1 a 14 px. */
export const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] border-[var(--data-warning-500)]/30",
  recibido: "bg-[var(--data-success-100)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)] border-[var(--data-success-500)]/30",
  parcial: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)] border-[var(--data-warning-500)]/30",
  cancelado: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-ink)] border-[var(--data-error-500)]/30",
  auto_generated: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]",
};

/** Color del texto de un paso del ciclo (C10): `-ink` para que llegue a 4,5:1 en claro y oscuro. */
export const TONO_TEXTO: Record<Tono, string> = {
  ok: "text-[var(--data-success-ink)]",
  info: "text-[var(--data-info-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  alerta: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

/** «tú» → «Te toca»; «el proveedor» → «Le toca al proveedor»; vacío → nada. */
export const quienLee = (quien: string) => (quien === "tú" ? "Te toca" : quien ? `Le toca a${quien.startsWith("el ") ? "l" + quien.slice(2) : ` ${quien}`}` : "");

/** Una orden como la trae `GET /api/purchases?seguimiento=1`: con lo que llegó y su cuenta por pagar. */
export type OrdenOC = DbPurchaseOrder & { seguimiento?: SeguimientoOC };

export type ItemDraft = { productId: number; name: string; quantity: number; unitCost: number; unit: string };

/** Clave de un intento de creación: dos clicks al mismo botón comparten clave. */
export function nuevaIdempotencyKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `oc-${Math.random().toString(36).slice(2)}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** Lima no tiene horario de verano: UTC−5 todo el año. */
const LIMA_MS = 5 * 3600 * 1000;

/**
 * «jueves 10/09» del día en Lima (la orden se guarda en UTC: a las 8 p. m. ya es
 * «mañana» en UTC). Con el año sólo si no es el actual. Sin depender del ICU del navegador.
 */
export function diaDeOrden(iso: string, hoy: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t - LIMA_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const anio = d.getUTCFullYear() === new Date(hoy.getTime() - LIMA_MS).getUTCFullYear() ? "" : `/${d.getUTCFullYear()}`;
  return `${DIAS[d.getUTCDay()]} ${dd}/${mm}${anio}`;
}

/** «2026-10» del mes en Lima, para sumar «este mes» sin el corrimiento de UTC. */
export function mesEnLima(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return Number.isFinite(t) ? new Date(t - LIMA_MS).toISOString().slice(0, 7) : "";
}

/** Una orden que armó el reabastecimiento automático (la nota la firma el cron). */
export const esAutomatica = (o: { notes?: string | null; status: string }) =>
  o.status === "auto_generated" || (o.notes ?? "").startsWith("Auto-generado");
