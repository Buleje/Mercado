"use client";

/**
 * OrderTrackerNavBadge — botón flotante en el navbar que aparece cuando hay
 * un pedido reciente (snapshot en localStorage). Pulse animation para llamar
 * la atención. Click → reabre el OrderSuccessModal.
 *
 * Estilo: pill con icono paquete + dot verde animado + nombre tienda.
 *   - Mobile: solo el icono circular.
 *   - Desktop: pill expandido con texto.
 */

import { ShoppingBag } from "@buleje/design-system/icons";
import { useLastOrder } from "@/contexts/last-order-context";

export default function OrderTrackerNavBadge({
  variant = "compact",
}: {
  variant?: "compact" | "expanded";
}) {
  const { order, hydrated, modalOpen, openModal } = useLastOrder();

  if (!hydrated || !order) return null;
  if (modalOpen) return null; // no mostrar el badge mientras el modal está abierto

  const itemsCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const storeLabel =
    order.storeNames.length === 1
      ? order.storeNames[0]
      : `${order.storeNames.length} tiendas`;

  return (
    <button
      type="button"
      onClick={openModal}
      aria-label="Ver mi pedido en curso"
      title={`Tu pedido en ${storeLabel} — toca para ver`}
      className={`
        relative inline-flex items-center gap-2 rounded-full
        bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/40
        hover:bg-[var(--accent)]/90 hover:scale-105 transition-all
        ${variant === "expanded" ? "h-10 px-4" : "h-10 w-10 sm:w-auto sm:px-3.5"}
      `}
    >
      {/* Pulse ring */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-50 animate-ping pointer-events-none"
      />
      {/* Glow estático sutil */}
      <span
        aria-hidden
        className="absolute -inset-0.5 rounded-full bg-[var(--accent)]/30 blur-md pointer-events-none"
      />

      <span className="relative flex items-center gap-2">
        <span className="relative flex items-center justify-center h-5 w-5">
          <ShoppingBag className="h-4 w-4" strokeWidth={2.5} />
          {/* Dot verde indicador "vivo" */}
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex h-2 w-2"
          >
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success)] opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-success)] ring-1 ring-white" />
          </span>
        </span>
        <span
          className={`text-xs font-extrabold whitespace-nowrap ${
            variant === "expanded" ? "" : "hidden sm:inline"
          }`}
        >
          Tu pedido · {itemsCount}
        </span>
      </span>
    </button>
  );
}
