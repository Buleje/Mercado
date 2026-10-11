"use client";

/**
 * Las partes del detalle de un pedido del marketplace (`OrderDetailModal`):
 * cliente, productos con sus totales, motivo de cancelación y el pie con las
 * acciones. Se separaron del modal sólo por tamaño (≤300 líneas por
 * componente, 11-10); lo que se ve y lo que hace cada botón es lo mismo.
 */
import {
  Phone,
  MapPin,
  NotebookText,
  Package,
  Copy,
  MessageCircle,
  ChevronRight,
  Receipt,
  User,
} from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import type { MarketplaceOrderDetail } from "./hooks/use-marketplace-orders";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { formatDateTime } from "@/lib/format";

const PEN_FMT = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
export const fmtCurrency = (v: number) => PEN_FMT.format(v);

/** Un cambio de estado del pedido (el primero va a la vista). */
export interface AccionDelPedido {
  id: string;
  label: string;
  peligro?: boolean;
  onSelect: () => void;
}

export function SeccionCliente({ order }: { order: MarketplaceOrderDetail }) {
  const initials = order.customerName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") ?? "—";

  function copyPhone() {
    if (!order.customerPhone) return;
    void navigator.clipboard?.writeText(order.customerPhone);
  }

  return (
    <section>
      <Kicker as="h3" className="libro-kicker mb-3 flex items-center gap-2">
        <User className="h-3.5 w-3.5" />
        Cliente
      </Kicker>
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center text-base font-extrabold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
              {order.customerName}
            </p>
            {order.customerPhone && (
              <button
                type="button"
                onClick={copyPhone}
                className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
                title="Click para copiar"
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="tabular-nums">{order.customerPhone}</span>
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>

        {(order.customerLocation || order.customerReference) && (
          <div className="mt-3 pt-3 border-t-2 border-[var(--rule-base)] space-y-2">
            {order.customerLocation && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {order.customerLocation}
                </p>
              </div>
            )}
            {order.customerReference && (
              <div className="flex items-start gap-2">
                <NotebookText className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <p className="text-sm italic text-[var(--text-secondary)]">
                  {order.customerReference}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function SeccionProductos({ order }: { order: MarketplaceOrderDetail }) {
  const subtotal = order.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  return (
    <section>
      <Kicker as="h3" className="libro-kicker mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5" />
          Productos
        </span>
        <span className="text-[var(--text-secondary)]">{order.items.length} ítem{order.items.length !== 1 ? "s" : ""}</span>
      </Kicker>
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] overflow-hidden">
        <ul className="divide-y-2 divide-[var(--rule-base)]">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 p-3">
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.image}
                  alt={it.name}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover border border-[var(--rule-base)]"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] flex items-center justify-center">
                  <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                  {it.name}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-flex h-5 items-center rounded-md bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                    ×{it.quantity}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
                    {fmtCurrency(it.price)}
                    {it.unit ? ` / ${it.unit}` : ""}
                  </span>
                </div>
              </div>
              <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmtCurrency(it.price * it.quantity)}
              </p>
            </li>
          ))}
        </ul>

        {/* Totales */}
        <div className="bg-[var(--surface-raised)] border-t-2 border-[var(--rule-base)] p-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-[var(--text-secondary)]">Subtotal</span>
            <span className="font-bold tabular-nums text-[var(--text-primary)]">
              {fmtCurrency(subtotal)}
            </span>
          </div>
          {order.discountAmount ? (
            <div className="flex justify-between text-sm text-[var(--data-success)]">
              <span className="font-bold">Descuento</span>
              <span className="font-bold tabular-nums">−{fmtCurrency(order.discountAmount)}</span>
            </div>
          ) : null}
          {order.couponDiscount ? (
            <div className="flex justify-between text-sm text-[var(--data-success)]">
              <span className="font-bold">Cupón</span>
              <span className="font-bold tabular-nums">−{fmtCurrency(order.couponDiscount)}</span>
            </div>
          ) : null}
          <div className="mt-2 pt-2 border-t-2 border-[var(--rule-base)] flex justify-between items-baseline">
            <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Total</span>
            <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {fmtCurrency(order.total)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SeccionCancelacion({ order }: { order: MarketplaceOrderDetail }) {
  if (order.status !== "cancelado" || !order.cancelReason) return null;
  return (
    <section className="rounded-2xl border-2 border-[var(--data-error)]/50 bg-[var(--data-error)]/10 p-4">
      <Kicker as="h3" className="font-bold flex items-center gap-2 text-[var(--data-error)] mb-2">
        <Receipt className="h-3.5 w-3.5" />
        Motivo de cancelación
      </Kicker>
      <p className="text-sm font-semibold text-[var(--data-error)]">
        {order.cancelReason}
      </p>
      {order.cancelledAt && (
        <p className="mt-1 text-xs font-bold text-[var(--data-error)]">
          {formatDateTime(order.cancelledAt)}
        </p>
      )}
    </section>
  );
}

export function PieDelPedido({
  order,
  onClose,
  onWhatsApp,
  acciones,
}: {
  order: MarketplaceOrderDetail;
  onClose: () => void;
  onWhatsApp?: (order: MarketplaceOrderDetail) => void;
  acciones: AccionDelPedido[];
}) {
  return (
    <footer className="shrink-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-3 flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onClose}
        className="h-12 px-4 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
      >
        Cerrar
      </button>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onWhatsApp && order.customerPhone && (
          <button
            type="button"
            onClick={() => onWhatsApp(order)}
            className="h-12 px-4 rounded-xl inline-flex items-center gap-2 border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
          </button>
        )}
        {/* Antes: «Cambiar estado» cerraba esto y abría un menú en la fila. Ahora el cambio va aquí mismo. */}
        {acciones.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={a.onSelect}
            className={cn(
              "h-12 px-4 rounded-xl inline-flex items-center gap-1.5 text-sm font-semibold transition-colors",
              a.peligro
                ? "text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10"
                : i === 0
                  ? button({ variant: "primary", className: "rounded-xl h-12" })
                  : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {a.label}
            {!a.peligro && i === 0 && <ChevronRight className="h-4 w-4" aria-hidden />}
          </button>
        ))}
      </div>
    </footer>
  );
}
