"use client";

/**
 * RecentlyViewedDrawer — Drawer compacto con productos vistos recientemente.
 *
 * Mejoras:
 *   - Tamaño reducido (max-h-[55vh] en mobile, max-w-md sticky-right en desktop)
 *   - Items más pequeños y limpios
 *   - Botón "+" para agregar al carrito sin salir del drawer
 *   - storeSlug derivado del url para hidratar items legacy del localStorage
 */

import Link from "next/link";
import Image from "next/image";
import { useCallback } from "react";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { X, Clock, Package, Plus, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  className?: string;
}

/** Extrae storeSlug de la url. El productId numérico viene del item (no del path,
 *  porque la url puede usar CUID alfanumérico como storeProductId). */
function parseStoreSlug(url: string): string | null {
  const m = url.match(/^\/marketplace\/([^/]+)\/producto\//);
  return m ? m[1] : null;
}

export default function RecentlyViewedDrawer({ open, onClose, className }: Props) {
  const { items, remove, clear } = useRecentlyViewed();
  const { addItem } = useMarketplaceCart();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAdd = useCallback(
    (item: typeof items[number]) => {
      const storeSlug = parseStoreSlug(item.url);
      const numericId = typeof item.id === "number" ? item.id : Number(item.id);
      if (!storeSlug || !Number.isFinite(numericId)) return;
      addItem({
        storeId: storeSlug,
        storeName: storeSlug,
        storeSlug,
        storeProductId: item.storeProductId ?? String(numericId),
        productId: numericId,
        name: item.name,
        price: item.price,
        image: item.image ?? null,
        unit: item.unit ?? null,
        quantity: 1,
      });
      const key = String(item.id);
      setAddedIds((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 1500);
    },
    [addItem],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recently-viewed-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center motion-safe:animate-[fadeIn_0.2s] p-0 sm:p-6"
    >
      {/* Backdrop con blur fuerte */}
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--text-primary)]/55 backdrop-blur-md"
      />

      {/* Modal centrado y pulido */}
      <div
        className={cn(
          "relative w-full sm:max-w-lg flex flex-col",
          "bg-[var(--surface-raised)] ring-1 ring-black/5",
          "rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/20",
          "max-h-[85vh] sm:max-h-[80vh]",
          "motion-safe:animate-[slideUp_0.3s_cubic-bezier(0.32,0.72,0,1)] sm:motion-safe:animate-[fadeIn_0.2s]",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle (sólo mobile) */}
        <div aria-hidden className="flex sm:hidden items-center justify-center pt-3 pb-1.5">
          <div className="w-12 h-1.5 rounded-full bg-[var(--rule-base)]" />
        </div>

        {/* Header — banner gradient con icono grande + título prominente */}
        <div className="relative px-6 pt-6 pb-5 border-b border-[var(--rule-soft)] bg-gradient-to-br from-[var(--accent)]/8 via-[var(--accent-soft,color-mix(in oklab, var(--accent) 8%, transparent))] to-transparent rounded-t-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30">
                  <Clock className="h-6 w-6" strokeWidth={2.25} aria-hidden />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-[0.12em] text-[var(--accent)] mb-0.5">
                  Tu historial
                </p>
                <h2
                  id="recently-viewed-title"
                  className="text-[length:clamp(1.25rem,2.5vw,1.5rem)] font-black tracking-tight text-[var(--text-primary)] leading-tight"
                >
                  Viste recientemente
                </h2>
                {items.length > 0 && (
                  <p className="mt-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)]">
                    {items.length} {items.length === 1 ? "producto guardado" : "productos guardados"}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors active:scale-90"
            >
              <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>

        {/* Action bar — Limpiar */}
        {items.length > 0 && (
          <div className="px-6 py-2.5 flex items-center justify-end border-b border-[var(--rule-soft)]">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--data-error,#e11d48)] transition-colors"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              Limpiar historial
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {items.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/5 flex items-center justify-center mb-5 ring-1 ring-[var(--accent)]/15">
                <Clock className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-[length:var(--ts-lg)] font-black tracking-tight text-[var(--text-primary)]">
                Sin historial aún
              </p>
              <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] mt-2 max-w-xs mx-auto leading-relaxed">
                Los productos que mires aparecerán acá por 7 días para que los retomes fácil.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => {
                const itemKey = String(item.id);
                const justAdded = addedIds.has(itemKey);
                const storeSlug = parseStoreSlug(item.url);
                const numericId = typeof item.id === "number" ? item.id : Number(item.id);
                const canAdd = !!storeSlug && Number.isFinite(numericId);

                return (
                  <li
                    key={itemKey}
                    className="group relative flex items-center gap-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 hover:border-[var(--accent)] hover:bg-[var(--surface-canvas)] hover:shadow-md transition-all"
                  >
                    <Link
                      href={item.url}
                      onClick={onClose}
                      className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]"
                      aria-label={`Ver ${item.name}`}
                    >
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="80px"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                          <Package className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </Link>

                    <Link
                      href={item.url}
                      onClick={onClose}
                      className="flex-1 min-w-0 py-0.5"
                    >
                      <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] line-clamp-2 leading-snug">
                        {item.name}
                      </p>
                      <p className="mt-1.5 text-[length:var(--ts-lg)] font-black text-[var(--brand-primary,var(--accent))] tabular-nums leading-none">
                        S/{Number(item.price).toFixed(2)}
                        {item.unit && (
                          <span className="ml-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
                            / {item.unit}
                          </span>
                        )}
                      </p>
                    </Link>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {canAdd && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAdd(item);
                          }}
                          aria-label={`Agregar ${item.name} al carrito`}
                          className={cn(
                            "h-11 w-11 flex items-center justify-center rounded-xl transition-all active:scale-90",
                            justAdded
                              ? "bg-[var(--data-success,#10b981)] text-white shadow-md"
                              : "bg-[var(--accent)] text-white hover:opacity-90 shadow-md shadow-[var(--accent)]/30 hover:shadow-lg hover:shadow-[var(--accent)]/40",
                          )}
                        >
                          {justAdded ? (
                            <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
                          ) : (
                            <Plus className="h-5 w-5" strokeWidth={3} aria-hidden />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          remove(item.id);
                        }}
                        aria-label={`Quitar ${item.name} del historial`}
                        className="h-7 w-7 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error,#e11d48)] hover:bg-[var(--surface-sunken)] sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
