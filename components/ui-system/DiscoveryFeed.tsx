"use client";

/**
 * DiscoveryFeed — Feed vertical infinito estilo Instagram/TikTok shopping.
 *
 * Cada card full-width con producto, tienda, precio, CTA "Agregar".
 * Al scrollear llega el final, useInfiniteScroll dispara fetch.
 *
 * A diferencia del grid estatico, este invita a explorar.
 *
 * Uso:
 *   <DiscoveryFeed
 *     items={products}
 *     hasMore={hasMore}
 *     onLoadMore={loadMore}
 *     onItemClick={(p) => router.push(`/tienda/${p.slug}`)}
 *     onAddToCart={(p) => addToCart(p)}
 *   />
 */

import Link from "next/link";
import Image from "next/image";
import { useInfiniteScroll } from "@/hooks/use-intersection-observer";
import { Heart, ShoppingCart, Share2, Store } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface FeedItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  image?: string;
  storeName: string;
  storeSlug: string;
  unit?: string;
  badge?: string;
  tagline?: string;
}

interface Props {
  items: FeedItem[];
  hasMore: boolean;
  onLoadMore: () => void;
  onItemClick?: (item: FeedItem) => void;
  onAddToCart?: (item: FeedItem) => void;
  onToggleFav?: (item: FeedItem) => void;
  onShare?: (item: FeedItem) => void;
  /** IDs de items ya favoritos para mostrar el heart lleno */
  favoriteIds?: Set<string>;
  /** ClassName */
  className?: string;
  /** Disabled infinite scroll (ej. loading inicial) */
  disabled?: boolean;
}

export default function DiscoveryFeed({
  items,
  hasMore,
  onLoadMore,
  onItemClick,
  onAddToCart,
  onToggleFav,
  onShare,
  favoriteIds,
  className,
  disabled = false,
}: Props) {
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    onLoadMore,
    disabled,
    rootMargin: "600px",
  });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {items.map((item) => (
        <article
          key={item.id}
          className={cn(
            "relative rounded-3xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-base)]",
            "hover:shadow-lg transition-shadow motion-safe:animate-[fadeUp_0.4s_ease-out]",
          )}
        >
          {/* Image */}
          <Link
            href={`/tienda/producto/${item.slug}`}
            onClick={() => onItemClick?.(item)}
            className="block relative aspect-[4/5] bg-[var(--surface-sunken)] overflow-hidden"
          >
            {item.image ? (
              <Image
                src={item.image}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover motion-safe:transition-transform motion-safe:duration-500 hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                <Store className="h-8 w-8" strokeWidth={1.5} aria-hidden />
              </div>
            )}

            {/* Badge superior */}
            {item.badge && (
              <span className="absolute top-3 left-3 inline-block rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
                {item.badge}
              </span>
            )}

            {/* Gradient + texto overlay */}
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/70 via-black/30 to-transparent" />

            <div className="absolute inset-x-4 bottom-4 text-white">
              <div className="flex items-center gap-2 mb-1">
                <Store className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                <span className="text-xs font-bold opacity-90">{item.storeName}</span>
              </div>
              <h3 className="text-lg font-extrabold leading-tight tracking-tight">{item.name}</h3>
              {item.tagline && <p className="text-xs opacity-80 mt-0.5">{item.tagline}</p>}
            </div>
          </Link>

          {/* Action row */}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            {/* Precio */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  S/{Number(item.price).toFixed(2)}
                </span>
                {item.originalPrice && item.originalPrice > item.price && (
                  <span className="text-xs line-through text-[var(--text-tertiary)] tabular-nums">
                    S/{Number(item.originalPrice).toFixed(2)}
                  </span>
                )}
              </div>
              {item.unit && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{item.unit}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {onToggleFav && (
                <button
                  type="button"
                  onClick={() => onToggleFav(item)}
                  aria-label="Favorito"
                  className="h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      favoriteIds?.has(item.id)
                        ? "fill-[var(--data-error,_#e11d48)] text-[var(--data-error,_#e11d48)]"
                        : "text-[var(--text-tertiary)]",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              )}
              {onShare && (
                <button
                  type="button"
                  onClick={() => onShare(item)}
                  aria-label="Compartir"
                  className="h-9 w-9 rounded-full inline-flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Share2 className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
                </button>
              )}
              {onAddToCart && (
                <button
                  type="button"
                  onClick={() => onAddToCart(item)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold hover:bg-[var(--accent)] transition-colors active:scale-95"
                >
                  <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Agregar
                </button>
              )}
            </div>
          </div>
        </article>
      ))}

      {/* Sentinel para infinite scroll */}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6" aria-hidden>
          <div className="h-2 w-16 bg-[var(--surface-sunken)] rounded-full animate-pulse" />
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="text-center py-6">
          <p className="text-xs text-[var(--text-tertiary)]">Ya viste todo · volvé más tarde por más bodegas</p>
        </div>
      )}
    </div>
  );
}
