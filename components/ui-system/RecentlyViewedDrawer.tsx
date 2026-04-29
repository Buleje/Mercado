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
      className="fixed inset-0 z-50 flex flex-col items-end justify-end sm:justify-center motion-safe:animate-[fadeIn_0.18s]"
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--text-primary)]/40 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          "relative w-full sm:max-w-md sm:m-4 bg-[var(--surface-raised)] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col",
          "max-h-[60vh] sm:max-h-[70vh]",
          "motion-safe:animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle (sólo mobile) */}
        <div aria-hidden className="flex sm:hidden items-center justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--rule-base)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b-2 border-[var(--rule-base)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/10">
              <Clock className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h2
                id="recently-viewed-title"
                className="text-base font-black tracking-tight text-[var(--text-primary)]"
              >
                Viste recientemente
              </h2>
              {items.length > 0 && (
                <p className="text-xs text-[var(--text-tertiary)]">
                  {items.length} {items.length === 1 ? "producto" : "productos"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] transition-colors px-2"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center mb-3">
                <Clock className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-base font-bold text-[var(--text-primary)]">Sin historial aún</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1.5 max-w-xs mx-auto">
                Los productos que mires aparecerán acá por 7 días.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const itemKey = String(item.id);
                const justAdded = addedIds.has(itemKey);
                const storeSlug = parseStoreSlug(item.url);
                const numericId = typeof item.id === "number" ? item.id : Number(item.id);
                const canAdd = !!storeSlug && Number.isFinite(numericId);

                return (
                  <li
                    key={itemKey}
                    className="group relative flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5 hover:border-[var(--accent)] transition-colors"
                  >
                    <Link
                      href={item.url}
                      onClick={onClose}
                      className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]"
                      aria-label={`Ver ${item.name}`}
                    >
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                          <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </Link>

                    <Link
                      href={item.url}
                      onClick={onClose}
                      className="flex-1 min-w-0 py-0.5"
                    >
                      <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
                        {item.name}
                      </p>
                      <p className="mt-1 text-base font-black text-[var(--text-primary)] tabular-nums">
                        S/{Number(item.price).toFixed(2)}
                        {item.unit && (
                          <span className="ml-1 text-xs font-medium text-[var(--text-tertiary)]">
                            / {item.unit}
                          </span>
                        )}
                      </p>
                    </Link>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {canAdd && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAdd(item);
                          }}
                          aria-label={`Agregar ${item.name} al carrito`}
                          className={cn(
                            "h-10 w-10 flex items-center justify-center rounded-xl transition-all active:scale-95",
                            justAdded
                              ? "bg-[var(--accent)] text-white"
                              : "bg-[var(--accent)] text-white hover:opacity-90 shadow-md hover:shadow-lg",
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
                        className="h-7 w-7 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] hover:bg-[var(--surface-sunken)] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
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
