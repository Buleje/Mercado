"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ShoppingBag, Sparkles } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import type { LiveFeaturedProduct } from "@/lib/mocks/lives.mock";

export interface FeaturedProductsInLiveProps {
  products: LiveFeaturedProduct[];
  /** Compact layout para sidebar del detalle. */
  compact?: boolean;
}

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FeaturedProductsInLive({
  products,
  compact = false,
}: FeaturedProductsInLiveProps) {
  const { addItem } = useMarketplaceCart();
  const [addedId, setAddedId] = useState<string | null>(null);

  const handleAdd = useCallback(
    (p: LiveFeaturedProduct) => {
      addItem({
        storeId: p.storeId,
        storeName: p.storeName,
        storeSlug: p.storeSlug,
        storeProductId: p.storeProductId,
        productId: p.productId,
        name: p.name,
        price: p.price,
        image: p.image,
        unit: p.unit,
        quantity: 1,
      });
      setAddedId(p.id);
      setTimeout(() => setAddedId((current) => (current === p.id ? null : current)), 1800);
    },
    [addItem],
  );

  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-4 text-center">
        <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          El vendedor aún no destacó productos en esta transmisión.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center gap-2 border-b border-[var(--rule-muted)] px-4 py-3">
        <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
          Productos destacados
        </span>
        <span className="ml-auto text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {products.length}
        </span>
      </header>

      <ul className="divide-y divide-[var(--rule-muted)]">
        {products.map((p) => {
          const added = addedId === p.id;
          return (
            <li
              key={p.id}
              className={
                compact
                  ? "flex items-center gap-3 px-3 py-3"
                  : "flex items-center gap-4 px-4 py-3"
              }
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
                {p.highlighted && (
                  <span
                    className="absolute inset-x-0 top-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide bg-[var(--data-error-500)] text-white text-center py-0.5"
                    aria-label="Destacado ahora"
                  >
                    Ahora
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] leading-tight line-clamp-2">
                  {p.name}
                </p>
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                  {fmt(p.price)}
                  {p.unit ? ` · ${p.unit}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleAdd(p)}
                aria-label={`Agregar ${p.name} al carrito`}
                className={
                  added
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-success-500)] px-3 py-2 text-[length:var(--ts-xs)] font-bold text-white"
                    : "inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--surface-canvas)] hover:opacity-90 transition-opacity"
                }
              >
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                {added ? "Agregado" : "Agregar"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
