"use client";

/**
 * RecentlyViewedDrawer — historial de productos vistos recientemente.
 *
 * Brandon 2026-06-06 (rediseño "mejor elaborado"):
 *   - Desktop: side-panel que desliza desde la DERECHA (drawer real, no
 *     modal centrado) — patrón apps de delivery premium.
 *   - Mobile: bottom-sheet con drag handle (como antes).
 *   - Items AGRUPADOS por tienda con header sticky por grupo.
 *   - Tiempo relativo por ítem ("hace 2 h") — refuerza la sensación de
 *     historial vivo.
 *   - Quick-add (+) con feedback ✓, quitar ítem, limpiar todo.
 *   - storeSlug derivado del url para hidratar items legacy del localStorage.
 */

import Link from "next/link";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { useRecentlyViewed, type RecentlyViewedItem } from "@/hooks/use-recently-viewed";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { X, Clock, Package, Plus, Check, Trash2, Store as StoreIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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

/** "ahora" · "hace 5 min" · "hace 2 h" · "hace 3 d" */
function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

/** "mi-pollo" → "Mi Pollo" (sin storeName real en el localStorage legacy). */
function prettySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function RecentlyViewedDrawer({ open, onClose, className }: Props) {
  const { items, remove, clear } = useRecentlyViewed();
  const { addItem } = useMarketplaceCart();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Agrupar por tienda preservando el orden de visita (la tienda del ítem
  // más reciente queda primera).
  const groups = useMemo(() => {
    const map = new Map<string, RecentlyViewedItem[]>();
    for (const it of items) {
      const slug = parseStoreSlug(it.url) ?? "otras";
      const list = map.get(slug);
      if (list) list.push(it);
      else map.set(slug, [it]);
    }
    return Array.from(map.entries());
  }, [items]);

  const handleAdd = useCallback(
    (item: RecentlyViewedItem) => {
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
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end motion-safe:animate-[fadeIn_0.15s]"
    >
      {/* Backdrop con blur */}
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--text-primary)]/55 backdrop-blur-md"
      />

      {/* Panel — bottom-sheet en mobile · side-panel derecho en sm+ */}
      <div
        className={cn(
          "relative flex w-full flex-col bg-[var(--surface-canvas)] shadow-2xl shadow-black/25",
          // Mobile: sheet desde abajo
          "max-h-[85vh] rounded-t-3xl",
          "motion-safe:animate-[slideUp_0.3s_cubic-bezier(0.32,0.72,0,1)]",
          // Desktop: panel lateral full-height desde la derecha
          "sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-[var(--rule-soft)]",
          "sm:motion-safe:animate-[slideInRight_0.3s_cubic-bezier(0.32,0.72,0,1)]",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle (sólo mobile) */}
        <div aria-hidden className="flex sm:hidden items-center justify-center pt-3 pb-1.5">
          <div className="w-12 h-1.5 rounded-full bg-[var(--rule-base)]" />
        </div>

        {/* Header — icono + título + count + cerrar */}
        <div className="relative shrink-0 border-b border-[var(--rule-soft)] bg-gradient-to-br from-[var(--accent)]/10 via-transparent to-transparent px-5 pb-4 pt-4 sm:pt-6 sm:rounded-tl-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shadow-md">
                <Clock className="h-6 w-6" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                  Tu historial
                </p>
                <h2
                  id="recently-viewed-title"
                  className="text-xl font-black tracking-tight text-[var(--text-primary)] leading-tight"
                >
                  Seguí viendo
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-[var(--text-secondary)] tabular-nums">
                  {items.length} {items.length === 1 ? "producto" : "productos"} · últimos 7 días
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 h-10 w-10 flex items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-sm hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors active:scale-90"
            >
              <X className="h-4 w-4" strokeWidth={2.75} aria-hidden />
            </button>
          </div>
        </div>

        {/* Content — grupos por tienda */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {items.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/5 flex items-center justify-center mb-5 ring-1 ring-[var(--accent)]/15">
                <Clock className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-[length:var(--ts-lg)] font-black tracking-tight text-[var(--text-primary)]">
                Sin historial aún
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-xs mx-auto leading-relaxed">
                Los productos que mires aparecerán acá por 7 días para que los retomes fácil.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(([slug, groupItems]) => (
                <section key={slug} aria-label={`Vistos en ${prettySlug(slug)}`}>
                  {/* Header del grupo — tienda + link */}
                  <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2 rounded-xl bg-[var(--surface-canvas)]/95 px-1 py-1.5 backdrop-blur">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <StoreIcon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    </span>
                    {slug !== "otras" ? (
                      <Link
                        href={`/marketplace/${slug}`}
                        onClick={onClose}
                        className="truncate text-sm font-extrabold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                      >
                        {prettySlug(slug)}
                      </Link>
                    ) : (
                      <span className="text-sm font-extrabold text-[var(--text-primary)]">Otras tiendas</span>
                    )}
                    <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                    <span className="shrink-0 text-[length:var(--ts-2xs)] font-black text-[var(--text-tertiary)] tabular-nums">
                      {groupItems.length}
                    </span>
                  </div>

                  <ul className="space-y-2">
                    {groupItems.map((item) => {
                      const itemKey = String(item.id);
                      const justAdded = addedIds.has(itemKey);
                      const storeSlug = parseStoreSlug(item.url);
                      const numericId = typeof item.id === "number" ? item.id : Number(item.id);
                      const canAdd = !!storeSlug && Number.isFinite(numericId);

                      return (
                        <li
                          key={itemKey}
                          className="group relative flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5 transition-all hover:border-[var(--accent)] hover:shadow-md"
                        >
                          <Link
                            href={item.url}
                            onClick={onClose}
                            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]"
                            aria-label={`Ver ${item.name}`}
                          >
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.name}
                                fill
                                sizes="64px"
                                className="object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                                <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                              </div>
                            )}
                          </Link>

                          <Link href={item.url} onClick={onClose} className="min-w-0 flex-1 py-0.5">
                            <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-snug">
                              {item.name}
                            </p>
                            <p className="mt-1 flex items-baseline gap-2">
                              <span className="text-base font-black text-[var(--accent-600,var(--accent))] tabular-nums leading-none">
                                S/{Number(item.price).toFixed(2)}
                              </span>
                              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                                {timeAgo(item.viewedAt)}
                              </span>
                            </p>
                          </Link>

                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {canAdd && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleAdd(item);
                                }}
                                aria-label={`Agregar ${item.name} al carrito`}
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-90",
                                  justAdded
                                    ? "bg-[var(--data-success-500,#10b981)] text-white shadow-md"
                                    : "bg-[var(--accent-600,var(--accent))] text-white shadow-md hover:brightness-110 hover:shadow-lg",
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
                              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error-500,#e11d48)] hover:bg-[var(--surface-sunken)] sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer — limpiar historial (acción destructiva, abajo y discreta) */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 py-3">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-500,#e11d48)] transition-colors"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Limpiar historial
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
