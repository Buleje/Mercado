"use client";

/**
 * DealsOfTheDayStrip — strip full-bleed con countdown hasta medianoche
 * y carrusel horizontal de productos "ofertas del dia".
 *
 * Patron Buleje: 0 emojis, 0 colores hardcoded, iconos del DS.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flame, Package } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import { cn } from "@/lib/utils";
import CartIconBtn from "./primitives/CartIconBtn";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCartQuantityMap } from "@/hooks/use-cart-quantity-map";
import { useAddedToCartDrawer } from "@/components/marketplace/AddedToCartDrawer";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CatalogItem {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  storeSlug: string;
  storeId?: string | null;
  storeName?: string | null;
  unit?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

function getSecondsUntilMidnight(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function DealsOfTheDayStrip() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsUntilMidnight);
  const { addItem } = useMarketplaceCart();
  const { open: openAddedModal } = useAddedToCartDrawer();
  const cartQty = useCartQuantityMap();

  const handleAdd = (item: CatalogItem) => () => {
    if (!item.storeId || !item.storeSlug) return;
    addItem({
      storeId: item.storeId,
      storeName: item.storeName ?? item.storeSlug,
      storeSlug: item.storeSlug,
      storeProductId: item.storeProductId,
      productId: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      unit: item.unit ?? null,
    });
    openAddedModal({
      storeId: item.storeId,
      storeName: item.storeName ?? item.storeSlug,
      storeSlug: item.storeSlug,
      storeProductId: item.storeProductId,
      productId: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      unit: item.unit ?? null,
    });
  };

  // Fetch productos
  useEffect(() => {
    fetch("/api/marketplace/catalog?sort=popular&limit=8", {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((json) => {
        const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        setItems(raw as CatalogItem[]);
      })
      .catch(() => setItems([]));
  }, []);

  // Countdown
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(getSecondsUntilMidnight());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (items === null) return null; // loading silencioso
  if (items.length === 0) return null;

  return (
    <div className="bg-linear-to-r from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)] border-y border-[var(--rule-soft)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header inline */}
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-[var(--rule-soft)]">
          <div className="flex items-center gap-3 min-w-0">
            <Flame className="h-6 w-6 text-[var(--accent)] shrink-0" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-[1.05]">
                Ofertas del dia
              </h2>
              <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)] mt-0.5">
                Termina en{" "}
                <span className="tabular-nums font-bold text-[var(--text-secondary)]">
                  {formatHMS(secondsLeft)}
                </span>
              </p>
            </div>
          </div>

          {/* Countdown grande */}
          <div
            aria-live="polite"
            aria-label={`Tiempo restante: ${formatHMS(secondsLeft)}`}
            className="shrink-0 tabular-nums font-black text-2xl text-[var(--text-primary)] leading-none"
          >
            {formatHMS(secondsLeft)}
          </div>
        </div>

        {/* Carrusel */}
        <HorizontalCarousel ariaLabel="Ofertas del dia">
          {items.map((item) => (
            <Link
              key={`${item.storeSlug}-${item.storeProductId}`}
              href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
              className={cn(
                "group/card relative block overflow-hidden rounded-xl transition-all duration-300",
                "border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
                "hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                "hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40",
                "motion-reduce:hover:translate-y-0",
              )}
            >
              {/* Badge descuento — tamaño legible */}
              <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center rounded-md bg-[var(--accent)] text-[var(--surface-canvas)] px-2.5 py-1 text-xs font-black tabular-nums leading-none shadow-sm">
                −30%
              </span>

              {/* Imagen (sin botón flotante) */}
              <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    sizes="240px"
                    className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Package className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
                  </span>
                )}
              </div>

              {/* Info — nombre → before tachado → precio + CARRITO AL LADO */}
              <div className="p-3 flex flex-col gap-1">
                <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                  {item.name}
                </p>
                <span className="text-sm text-[var(--text-tertiary)] line-through tabular-nums leading-none">
                  {pen.format(item.price / 0.7)}
                </span>
                <div className="flex items-end justify-between gap-2 mt-0.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--accent)] leading-none">
                      {pen.format(item.price)}
                    </p>
                    <p className="mt-1 text-[length:var(--ts-xs)] font-bold text-[var(--data-success-500)] tabular-nums leading-none">
                      Ahorrás {pen.format(item.price / 0.7 - item.price)}
                    </p>
                  </div>
                  {item.storeId && item.storeSlug && (
                    <CartIconBtn
                      onAdd={handleAdd(item)}
                      quantityInCart={cartQty.get(item.storeProductId) ?? 0}
                    />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </HorizontalCarousel>
      </div>
    </div>
  );
}
