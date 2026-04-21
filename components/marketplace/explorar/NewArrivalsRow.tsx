"use client";

/**
 * NewArrivalsRow — carrusel horizontal de productos recien llegados
 * con badge "Nuevo" top-left en cada card.
 *
 * Patron Buleje: 0 emojis, 0 colores hardcoded, iconos del DS.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "./ExplorarSectionHeader";
import CartIconBtn from "./primitives/CartIconBtn";
import { useCartQuantityMap } from "@/hooks/use-cart-quantity-map";
import { useAddedToCartDrawer } from "@/components/marketplace/AddedToCartDrawer";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <HorizontalCarousel ariaLabel="Cargando recien llegados" showNav={false}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer rounded-xl aspect-[3/4] w-full" />
      ))}
    </HorizontalCarousel>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function NewArrivalsRow() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const { addItem } = useMarketplaceCart();
  const { open: openAddedModal } = useAddedToCartDrawer();
  const cartQty = useCartQuantityMap();

  const handleAdd = (item: CatalogItem) => () => {
    if (!item.storeId || !item.storeSlug) return;
    const payload = {
      storeId: item.storeId,
      storeName: item.storeName ?? item.storeSlug,
      storeSlug: item.storeSlug,
      storeProductId: item.storeProductId,
      productId: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      unit: item.unit ?? null,
    };
    addItem(payload);
    openAddedModal(payload);
  };

  useEffect(() => {
    fetch("/api/marketplace/catalog?sort=newest&limit=12", { cache: "no-store" })
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

  if (items !== null && items.length === 0) return null;

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <ExplorarSectionHeader
        kicker="Lo nuevo"
        title="Recien llegados"
        subtitle="Productos que aparecieron esta semana"
        ctaLabel="Ver todo nuevo"
        ctaHref="/marketplace?vista=catalogo&sort=newest"
      />

      {items === null ? (
        <SkeletonRow />
      ) : (
        <HorizontalCarousel ariaLabel="Recien llegados">
          {items.map((item) => (
            <Link
              key={`${item.storeSlug}-${item.storeProductId}`}
              href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
              className="group/card relative block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
            >
              {/* Badge "Nuevo" — tamaño legible */}
              <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-1 text-xs font-bold uppercase tracking-wider leading-none">
                Nuevo
              </span>

              {/* Imagen */}
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

              {/* Info — nombre → precio + CARRITO AL LADO */}
              <div className="p-3 flex flex-col gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                  {item.name}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-black tabular-nums tracking-[-0.02em] text-[var(--text-primary)] leading-none">
                    {pen.format(item.price)}
                  </p>
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
      )}
    </section>
  );
}
