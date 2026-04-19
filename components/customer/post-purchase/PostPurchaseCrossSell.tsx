"use client";

/**
 * PostPurchaseCrossSell — "Gente que compró esto también lleva".
 *
 * Sección post-confirmación de compra con grid horizontal de productos
 * recomendados. Chip "Agregar a próximo pedido" para cada uno.
 *
 * Fuente de datos: mock estático por ahora. Prod: `/api/products/co-purchased`.
 *
 * ADR-068: tokens CSS only, 0 emojis, 0 gradientes.
 */

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Check, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { useCurrency } from "@/contexts/currency-context";
import { useLocale } from "@/contexts/locale-context";

export interface CrossSellProduct {
  id: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  storeName?: string;
  storeSlug?: string;
  storeProductId?: string;
}

interface PostPurchaseCrossSellProps {
  orderId: string;
  products: CrossSellProduct[];
  /** Acción "Agregar a próximo pedido" — mock, solo UI */
  onAddToNext?: (productId: number) => void;
}

const DEFAULT_PRODUCTS: CrossSellProduct[] = [
  { id: 301, name: "Aceite Primor 1L", price: 12.5, image: null, unit: "1 L", storeName: "Buleje", storeSlug: "san-martin" },
  { id: 302, name: "Arroz Costeño 5kg", price: 28.9, image: null, unit: "5 kg", storeName: "Buleje", storeSlug: "san-martin" },
  { id: 303, name: "Azúcar Rubia 1kg", price: 4.2, image: null, unit: "1 kg", storeName: "Buleje", storeSlug: "san-martin" },
  { id: 304, name: "Leche Gloria 400g", price: 3.8, image: null, unit: "400 g", storeName: "Buleje", storeSlug: "san-martin" },
  { id: 305, name: "Fideos Don Vittorio 500g", price: 3.1, image: null, unit: "500 g", storeName: "Buleje", storeSlug: "san-martin" },
  { id: 306, name: "Atún Florida en aceite", price: 5.5, image: null, unit: "170 g", storeName: "Buleje", storeSlug: "san-martin" },
];

export default function PostPurchaseCrossSell({
  orderId,
  products,
  onAddToNext,
}: PostPurchaseCrossSellProps) {
  // Si no se pasan productos (o array vacío), usar defaults mock
  const resolved = products && products.length > 0 ? products : DEFAULT_PRODUCTS;
  const { format } = useCurrency();
  const { t } = useLocale();
  const [added, setAdded] = useState<Set<number>>(new Set());

  const handleAdd = useCallback(
    (id: number) => {
      setAdded((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      onAddToNext?.(id);
    },
    [onAddToNext],
  );

  return (
    <section
      aria-labelledby="cross-sell-title"
      className="space-y-4"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2
            id="cross-sell-title"
            className="text-[length:var(--ts-lg)] font-bold text-[var(--text-primary)]"
          >
            {t("postPurchase.alsoBought")}
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
            Basado en tu pedido #{orderId.slice(0, 8)}
          </p>
        </div>
        <Link
          href="/marketplace/explorar"
          className="hidden sm:inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          {t("postPurchase.exploreMore")}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {/* Grid horizontal scroll en mobile, grid 6-col en desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {resolved.slice(0, 6).map((product) => {
          const isAdded = added.has(product.id);
          return (
            <article
              key={product.id}
              className={cn(
                "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]",
                "p-3 flex flex-col gap-2 transition-colors",
                "hover:border-[var(--rule-strong)]",
              )}
            >
              <Link
                href={
                  product.storeSlug && product.storeProductId
                    ? `/marketplace/${product.storeSlug}/producto/${product.storeProductId}`
                    : "#"
                }
                className="block aspect-square rounded-lg bg-[var(--surface-sunken)] overflow-hidden relative"
              >
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 180px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">
                    {product.name.split(" ")[0]}
                  </div>
                )}
              </Link>
              <div className="flex-1 min-h-0">
                <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight">
                  {product.name}
                </p>
                {product.unit && (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                    {product.unit}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[length:var(--ts-sm)] font-extrabold tabular-nums text-[var(--text-primary)]">
                  {format(product.price)}
                </span>
                <button
                  type="button"
                  onClick={() => handleAdd(product.id)}
                  aria-label={t("postPurchase.addToNext")}
                  className={cn(
                    "inline-flex items-center justify-center",
                    "h-7 w-7 rounded-full transition-colors",
                    isAdded
                      ? "bg-[var(--data-success)] text-white"
                      : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90",
                  )}
                >
                  {isAdded ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Link mobile only */}
      <Link
        href="/marketplace/explorar"
        className="sm:hidden inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--accent)] hover:underline"
      >
        {t("postPurchase.exploreMore")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}
