"use client";

/**
 * ExplorarRelacionados — 2 carruseles single-row estilo Amazon Bazaar.
 *   1. "Relacionados con los artículos que viste"
 *   2. "Más artículos por considerar"
 *
 * Cada carrusel es una fila horizontal con drag scroll. Mantiene la
 * variedad visual de la pagina con cajas 2x2 + carruseles largos.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "./ExplorarSectionHeader";
import CartIconBtn from "./primitives/CartIconBtn";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCartQuantityMap } from "@/hooks/use-cart-quantity-map";
import { useAddedToCartDrawer } from "@/components/marketplace/AddedToCartDrawer";

type Product = {
  storeProductId: string;
  productId: number;
  storeSlug: string | null;
  storeId?: string | null;
  storeName?: string | null;
  name: string;
  image: string | null;
  price: number;
  unit: string | null;
};

type Carousel = {
  id: string;
  title: string;
  subtitle?: string;
  query: string;
  href: string;
};

const CAROUSELS: Array<Carousel & { kicker: string }> = [
  {
    id: "relacionados",
    kicker: "Inspirado en lo que viste",
    title: "Que pruebes algo similar",
    subtitle: "Mismas categorias, otras marcas que tus vecinos eligen",
    query: "sort=popular&limit=12",
    href: "/marketplace?vista=catalogo&sort=popular",
  },
  {
    id: "mas-considerar",
    kicker: "Lo nuevo del mes",
    title: "Productos que recien aparecen",
    subtitle: "Recien sumados al marketplace por nuestras bodegas",
    query: "sort=newest&limit=12",
    href: "/marketplace?vista=catalogo&sort=newest",
  },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function ExplorarRelacionados() {
  const [data, setData] = useState<Record<string, Product[]>>(
    () => Object.fromEntries(CAROUSELS.map((c) => [c.id, []])),
  );
  const { addItem } = useMarketplaceCart();
  const { open: openAddedModal } = useAddedToCartDrawer();
  const cartQty = useCartQuantityMap();

  useEffect(() => {
    let cancelled = false;
    const fetchOne = async (c: Carousel): Promise<Product[]> => {
      try {
        const res = await fetch(`/api/marketplace/catalog?${c.query}`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        return ((json.items ?? json.data ?? []) as Product[]).slice(0, 12);
      } catch {
        return [];
      }
    };
    Promise.all(
      CAROUSELS.map(async (c) => [c.id, await fetchOne(c)] as const),
    ).then((entries) => {
      if (!cancelled) setData(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, []);

  const handleAdd = (p: Product) => () => {
    if (!p.storeId || !p.storeSlug) return;
    const item = {
      storeId: p.storeId,
      storeName: p.storeName ?? p.storeSlug,
      storeSlug: p.storeSlug,
      storeProductId: p.storeProductId,
      productId: p.productId,
      name: p.name,
      price: p.price,
      image: p.image,
      unit: p.unit,
    };
    addItem(item);
    openAddedModal(item);
  };

  return (
    <div className="w-full space-y-12 py-10">
      {CAROUSELS.map((c) => {
        const items = data[c.id] ?? [];
        const isEmpty = items.length === 0;
        return (
          <section
            key={c.id}
            aria-labelledby={`carousel-${c.id}-title`}
            className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8"
          >
            <ExplorarSectionHeader
              kicker={c.kicker}
              title={c.title}
              subtitle={c.subtitle}
              ctaLabel="Ver todos"
              ctaHref={c.href}
            />

            {isEmpty ? (
              <HorizontalCarousel ariaLabel={c.title} showNav={false}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl skeleton-shimmer" />
                ))}
              </HorizontalCarousel>
            ) : (
              <HorizontalCarousel ariaLabel={c.title}>
                {items.map((p) => {
                  const canAdd = !!(p.storeId && p.storeSlug);
                  return (
                    <Link
                      key={p.storeProductId}
                      href={p.storeSlug ? `/marketplace/${p.storeSlug}/producto/${p.productId}` : "/marketplace"}
                      className="group/card relative block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
                    >
                      <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
                        {p.image ? (
                          <Image
                            src={p.image}
                            alt={p.name}
                            fill
                            sizes="240px"
                            className="object-cover transition-transform duration-500 ease-out group-hover/card:scale-105 motion-reduce:transition-none"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                            <Package className="h-10 w-10" strokeWidth={1.25} aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                          {p.name}
                        </p>
                        {p.storeName && (
                          <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] truncate leading-none">
                            {p.storeName}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className="flex items-baseline gap-1 min-w-0">
                            <span className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                              {fmt(p.price)}
                            </span>
                            {p.unit && (
                              <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] tabular-nums">
                                /{p.unit}
                              </span>
                            )}
                          </div>
                          {canAdd && (
                            <CartIconBtn
                              onAdd={handleAdd(p)}
                              quantityInCart={cartQty.get(p.storeProductId) ?? 0}
                            />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </HorizontalCarousel>
            )}
          </section>
        );
      })}
    </div>
  );
}
