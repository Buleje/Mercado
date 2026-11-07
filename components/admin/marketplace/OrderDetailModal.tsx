"use client";

/**
 * Modal de detalle de orden del marketplace.
 *
 * Brandon mayo 2026 v7 (Nivel B): el admin puede ver todos los productos,
 * subtotales, dirección completa, comprobante, descuentos y motivo de
 * cancelación sin salir de la tabla. Cierra con ESC o click fuera.
 *
 * Diseño v2 (2026-05-16): rediseño completo con tokens BSM correctos
 * (--surface-raised, --rule-base, --accent, --text-primary). Hero con
 * número de orden + estado + total grande. Footer con acciones rápidas.
 */
import { Copy } from "@buleje/design-system/icons";
import type { MarketplaceOrderDetail } from "./hooks/use-marketplace-orders";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  fmtCurrency,
  SeccionCliente,
  SeccionProductos,
  SeccionCancelacion,
  PieDelPedido,
  type AccionDelPedido,
} from "./OrderDetailPartes";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";

interface Props {
  order: MarketplaceOrderDetail | null;
  loading?: boolean;
  onClose: () => void;
  onWhatsApp?: (order: MarketplaceOrderDetail) => void;
  /** Los cambios de estado que admite el pedido (el primero, a la vista). Cerrar y cambiar lo hace quien llama. */
  acciones?: AccionDelPedido[];
}

const STATUS_META: Record<string, { label: string; dot: string; chip: string; text: string }> = {
  pendiente: {
    label: "Pendiente",
    dot: "bg-[var(--data-warning)]",
    chip: "bg-[var(--data-warning)]/15 border-[var(--data-warning)]/30",
    text: "text-[var(--data-warning)]",
  },
  confirmado: {
    label: "Confirmado",
    dot: "bg-[var(--data-success)]",
    chip: "bg-[var(--data-success)]/15 border-[var(--data-success)]/30",
    text: "text-[var(--data-success)]",
  },
  preparando: {
    label: "Preparando",
    dot: "bg-[var(--data-info)]",
    chip: "bg-[var(--data-info)]/15 border-[var(--data-info)]/30",
    text: "text-[var(--data-info)]",
  },
  en_camino: {
    label: "En camino",
    dot: "bg-[var(--data-info)]",
    chip: "bg-[var(--data-info)]/15 border-[var(--data-info)]/30",
    text: "text-[var(--data-info)]",
  },
  entregado: {
    label: "Entregado",
    dot: "bg-[var(--data-success)]",
    chip: "bg-[var(--data-success)]/15 border-[var(--data-success)]/30",
    text: "text-[var(--data-success)]",
  },
  cancelado: {
    label: "Cancelado",
    dot: "bg-[var(--data-error)]",
    chip: "bg-[var(--data-error)]/15 border-[var(--data-error)]/30",
    text: "text-[var(--data-error)]",
  },
};

export function OrderDetailModal({ order, loading, onClose, onWhatsApp, acciones = [] }: Props) {
  if (!order && !loading) return null;

  const statusMeta = order ? (STATUS_META[order.status] ?? STATUS_META.pendiente) : null;
  const orderShortId = order?.id.slice(-8).toUpperCase() ?? "—";

  function copyId() {
    if (!order) return;
    void navigator.clipboard?.writeText(`#${orderShortId}`);
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Pedido marketplace #${orderShortId}`}
      description={order ? formatDateTime(order.createdAt) : undefined}
      size="lg"
      claveVentana="marketplace-orden-detalle"
      footer={
        order ? (
          <PieDelPedido
            order={order}
            onClose={onClose}
            onWhatsApp={onWhatsApp}
            acciones={acciones}
          />
        ) : undefined
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {order && statusMeta && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-xs font-extrabold uppercase tracking-wide",
                  statusMeta.chip,
                  statusMeta.text,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", statusMeta.dot)} />
                {statusMeta.label}
              </span>
              {order && (
                <button
                  type="button"
                  onClick={copyId}
                  aria-label="Copiar ID"
                  title="Copiar ID"
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="text-right">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                Total
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmtCurrency(order.total)}
              </p>
            </div>
          </div>
        )}
        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 border-4 border-[var(--rule-base)] border-t-[var(--accent)] rounded-full animate-spin" />
            <p className="mt-3 text-sm font-bold text-[var(--text-secondary)]">Cargando detalle…</p>
          </div>
        ) : order ? (
          <>
            <SeccionCliente order={order} />
            <SeccionProductos order={order} />
            <SeccionCancelacion order={order} />
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}
