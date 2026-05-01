"use client";

/**
 * OrderDetailsModal — modal full-screen con el detalle del pedido.
 *
 * Se activa desde el botón "ojo" en el paso de confirmación. Muestra:
 *   - Cada tienda como sección
 *   - Cada producto con imagen GRANDE (120px), nombre, unidad, qty, subtotal
 *   - Totales claros al final
 *
 * Diseño editorial coherente con el resto del checkout.
 */

import Image from "next/image";
import { useEffect } from "react";
import { X, ShoppingCart, Store, ArrowDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { CartItem } from "@/hooks/use-marketplace-cart";

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
  // Escape + scroll lock
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
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-[var(--surface-canvas)] sm:rounded-3xl overflow-hidden shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] animate-[scaleIn_.25s_ease-out]">
        {/* Header sticky con kicker */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 sm:px-8 py-5 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur-md">
          <div>
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-8 rounded-full bg-[var(--accent)]"
              />
              Detalle del pedido
            </p>
            <h2
              id="order-details-title"
              className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]"
            >
              Tu pedido{" "}
              <span className="italic font-serif text-[var(--accent)]">en detalle</span>
            </h2>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {totalItems} {totalItems === 1 ? "producto" : "productos"} ·{" "}
              {groups.length} {groups.length === 1 ? "tienda" : "tiendas"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </header>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-8">
          {groups.map((g) => {
            const storeTotal = totalByStore[g.storeId]?.total ?? 0;
            return (
              <section key={g.storeId} className="space-y-4">
                <header className="flex items-center justify-between gap-3 pb-3 border-b-2 border-[var(--rule-soft)]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                      <Store className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                        Tienda
                      </p>
                      <h3 className="text-lg sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                        {g.storeName}
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      Subtotal
                    </p>
                    <p className="text-xl sm:text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      {fmt(storeTotal)}
                    </p>
                  </div>
                </header>

                <ul className="space-y-3">
                  {g.items.map((it) => (
                    <li
                      key={`${it.storeId}-${it.productId}`}
                      className="flex gap-4 sm:gap-5 items-start rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5"
                    >
                      {/* Imagen GRANDE */}
                      <div className="relative h-24 w-24 sm:h-32 sm:w-32 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
                        {it.image ? (
                          <Image
                            src={it.image}
                            alt={it.name}
                            fill
                            sizes="128px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                            <ShoppingCart className="h-9 w-9" strokeWidth={1.5} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                        <div>
                          <h4 className="text-base sm:text-lg font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] line-clamp-2">
                            {it.name}
                          </h4>
                          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                            {fmt(it.price)}
                            {it.unit && (
                              <span className="ml-1 text-xs">
                                / {it.unit}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                            ×{it.quantity}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)] inline-flex items-center gap-1">
                            <ArrowDown className="h-3 w-3" strokeWidth={2} aria-hidden />
                            subtotal
                          </span>
                          <span className="ml-auto text-lg sm:text-xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                            {fmt(it.price * it.quantity)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Footer sticky con total */}
        <footer className="sticky bottom-0 px-6 sm:px-8 py-5 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur-md flex items-center justify-between gap-4">
          <div>
            <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Total del pedido
            </p>
            <p className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none mt-1">
              {fmt(grandTotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full px-7 h-12",
              "text-sm font-bold transition-all",
              "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
              "shadow-[0_6px_20px_-10px_var(--accent)]",
            )}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
