/**
 * Lo que lleva el pedido. El total ya está en la cabecera: acá sólo se
 * desglosa cuando hubo descuento o cupón (subtotal − rebajas = total). Antes
 * «TOTAL A COBRAR» repetía la cifra de la cabecera en todos los pedidos.
 */
import { CardTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";

const FILA = "flex items-center justify-between px-4 py-1.5 text-sm";

export function DetalleProductos({ order }: { order: DbOrder }) {
  const rebaja = (order.discountAmount ?? 0) > 0 || (order.couponDiscount ?? 0) > 0;
  /* Subtotal de la vista: precio × cantidad de cada línea (lo que el servidor guardó); el total es el del servidor. */
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <CardTitle className="text-sm font-bold">Productos</CardTitle>
        <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
          {order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <ul className="divide-y divide-[var(--rule-soft)]">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  <span className="mr-1 font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    {item.quantity}×
                  </span>
                  {item.name}
                </p>
                <p className="text-sm tabular-nums text-[var(--text-secondary)]">
                  {formatCurrency(Number(item.price))} · {item.unit}
                </p>
                {item.note && (
                  <p className="mt-0.5 text-sm italic text-[var(--text-secondary)]">
                    “{item.note}”
                  </p>
                )}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                {formatCurrency(item.price * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
        {rebaja && (
          <div className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 py-1">
            <div className={FILA}>
              <span className="text-[var(--text-secondary)]">Subtotal</span>
              <span className="tabular-nums text-[var(--text-secondary)]">
                {formatCurrency(subtotal)}
              </span>
            </div>
            {(order.discountAmount ?? 0) > 0 && (
              <div className={FILA}>
                <span className="font-semibold text-[var(--data-success-ink)]">
                  Descuento{order.appliedPromoId ? ` · ${order.appliedPromoId}` : ""}
                </span>
                <span className="font-semibold tabular-nums text-[var(--data-success-ink)]">
                  −{formatCurrency(Number(order.discountAmount))}
                </span>
              </div>
            )}
            {(order.couponDiscount ?? 0) > 0 && (
              <div className={FILA}>
                <span className="font-semibold text-[var(--data-success-ink)]">
                  Cupón{order.appliedCouponCode ? ` · ${order.appliedCouponCode}` : ""}
                </span>
                <span className="font-semibold tabular-nums text-[var(--data-success-ink)]">
                  −{formatCurrency(Number(order.couponDiscount))}
                </span>
              </div>
            )}
            <div className={`${FILA} font-bold text-[var(--text-primary)]`}>
              <span>Total a cobrar</span>
              <span className="tabular-nums">{formatCurrency(Number(order.total))}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
