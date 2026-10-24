"use client";

/**
 * OrderDetailsModal — modal con el detalle del pedido (botón "ojo" en confirmar).
 *
 * Rediseño 2026-07-06 (Brandon): tipografía suavizada (menos negrita, títulos
 * más chicos) y filas de producto mejor acomodadas — miniatura + nombre/precio
 * a la izquierda, cantidad + subtotal a la derecha, alineados.
 */

import Image from "next/image";
import { useEffect } from "react";
import { X, ShoppingCart, Store } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { modifierHashOf, type CartItem } from "@/hooks/use-marketplace-cart";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type StoreGroup = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  items: CartItem[];
};

interface OrderDetailsModalProps {
  open: boolean;
  onClose: () => void;
  groups: StoreGroup[];
  totalByStore: Record<string, { total: number }>;
  grandTotal: number;
}

export default function OrderDetailsModal({
  open,
  onClose,
  groups,
  totalByStore,
  grandTotal,
}: OrderDetailsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]"
      />

      <div className="relative w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col bg-[var(--surface-canvas)] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] animate-[scaleIn_.25s_ease-out]">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h2
                id="order-details-title"
                className="text-lg sm:text-xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight"
              >
                Detalle del pedido
              </h2>
              <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)] leading-tight">
                {totalItems} {totalItems === 1 ? "producto" : "productos"} ·{" "}
                {groups.length} {groups.length === 1 ? "tienda" : "tiendas"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
          {groups.map((g) => {
            const storeTotal = totalByStore[g.storeId]?.total ?? 0;
            return (
              <section key={g.storeId} className="space-y-3">
                <header className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--rule-soft)]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <Store className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    <h3 className="text-base font-semibold tracking-[var(--ls-tight)] text-[var(--text-primary)] truncate">
                      {g.storeName}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Subtotal
                    </p>
                    <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">
                      {fmt(storeTotal)}
                    </p>
                  </div>
                </header>

                <ul className="space-y-2.5">
                  {g.items.map((it) => (
                    <li
                      key={`${it.storeId}-${it.productId}-${it.modifierHash ?? modifierHashOf(it.modifiers)}`}
                      className="flex gap-3 sm:gap-4 items-center rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 sm:p-3.5"
                    >
                      {/* Miniatura */}
                      <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
                        {it.image ? (
                          <Image
                            src={it.image}
                            alt={it.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                            <ShoppingCart className="h-6 w-6" strokeWidth={1.5} />
                          </div>
                        )}
                        <span className="absolute right-1 top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-black/70 px-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-white">
                          ×{it.quantity}
                        </span>
                      </div>

                      {/* Nombre + precio unitario */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[length:var(--ts-sm)] sm:text-base font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
                          {it.name}
                        </h4>
                        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                          {fmt(it.price)}
                          {it.unit && <span> / {it.unit}</span>}
                        </p>
                      </div>

                      {/* Subtotal del ítem */}
                      <span className="shrink-0 text-base font-bold tabular-nums text-[var(--text-primary)]">
                        {fmt(it.price * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 px-5 sm:px-7 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur-md flex items-center justify-between gap-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Total del pedido
            </p>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums tracking-[-0.02em] text-[var(--text-primary)] leading-none mt-0.5">
              {fmt(grandTotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full px-6 h-12",
              "text-base font-semibold transition-opacity",
              "bg-[var(--accent)] text-white hover:opacity-90",
            )}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
