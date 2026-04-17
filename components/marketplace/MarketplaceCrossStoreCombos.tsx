"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, MapPin, Plus, Sparkles, Store as StoreIcon } from "lucide-react";
import type { CartItem } from "@/hooks/use-marketplace-cart";
import {
  buildCrossStoreComboSuggestions,
  type CrossStoreCatalogProduct,
  type CrossStoreComboSuggestion,
} from "@/lib/marketplace/cross-store-combos";

interface MarketplaceCrossStoreCombosProps {
  cartItems: CartItem[];
  onAddSuggestion: (suggestion: CrossStoreComboSuggestion) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function getPreferredZone(cartItems: CartItem[]): string | null {
  const counts = new Map<string, { count: number; label: string }>();

  for (const item of cartItems) {
    if (!item.storeZone) continue;
    const key = item.storeZone.trim().toLowerCase();
    if (!key) continue;

    const existing = counts.get(key);
    if (existing) {
      existing.count += item.quantity;
      continue;
    }

    counts.set(key, { count: item.quantity, label: item.storeZone });
  }

  return [...counts.values()].sort((left, right) => right.count - left.count)[0]?.label ?? null;
}

async function fetchCatalog(zone: string | null): Promise<CrossStoreCatalogProduct[]> {
  const params = new URLSearchParams({ limit: "60", sort: "rating" });
  if (zone) {
    params.set("zone", zone);
  }

  const response = await fetch(`/api/marketplace/catalog?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { data?: CrossStoreCatalogProduct[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

function ComboSkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
          <div className="h-8 w-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceCrossStoreCombos({
  cartItems,
  onAddSuggestion,
}: MarketplaceCrossStoreCombosProps) {
  const [addedStoreProductId, setAddedStoreProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CrossStoreComboSuggestion[]>([]);

  const preferredZone = useMemo(() => getPreferredZone(cartItems), [cartItems]);
  const requestKey = useMemo(
    () =>
      cartItems
        .map((item) =>
          [
            item.storeId,
            item.productId,
            item.quantity,
            item.category ?? "",
            item.storeZone ?? "",
          ].join(":"),
        )
        .join("|"),
    [cartItems],
  );
  const hasCategoryContext = useMemo(
    () => cartItems.some((item) => Boolean(item.category?.trim())),
    [cartItems],
  );

  useEffect(() => {
    if (!requestKey || !hasCategoryContext) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadSuggestions = async () => {
      setLoading(true);

      try {
        const zonedCatalog = await fetchCatalog(preferredZone);
        let nextSuggestions = buildCrossStoreComboSuggestions(cartItems, zonedCatalog, 3);

        if (nextSuggestions.length === 0 && preferredZone) {
          const fallbackCatalog = await fetchCatalog(null);
          nextSuggestions = buildCrossStoreComboSuggestions(cartItems, fallbackCatalog, 3);
        }

        if (!cancelled) {
          setSuggestions(nextSuggestions);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSuggestions();

    return () => {
      cancelled = true;
    };
  }, [cartItems, hasCategoryContext, preferredZone, requestKey]);

  if (!loading && suggestions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-primary/15 bg-linear-to-br from-primary/6 via-white to-amber-50/60 p-4 dark:border-primary/20 dark:from-primary/10 dark:via-gray-900 dark:to-gray-950">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <p className="text-xs font-black uppercase tracking-[0.24em]">Combo inteligente</p>
          </div>
          <h3 className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
            Completa tu compra con otra tienda sin volver a buscar
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Elegimos productos que combinan con tu canasta actual y que pueden llegar junto a tu pedido.
          </p>
        </div>
        {preferredZone && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-primary dark:bg-gray-900/80">
            <MapPin className="h-3 w-3" />
            {preferredZone}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {loading
          ? Array.from({ length: 2 }).map((_, index) => <ComboSkeletonCard key={index} />)
          : suggestions.map((suggestion) => {
              const wasAdded = addedStoreProductId === suggestion.storeProductId;

              return (
                <article
                  key={suggestion.storeProductId}
                  className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/90"
                >
                  <div className="flex gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
                      {suggestion.image ? (
                        <Image
                          src={suggestion.image}
                          alt={suggestion.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-primary/70">
                          <StoreIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          {suggestion.targetCategory}
                        </span>
                        <span className="text-xs font-bold text-primary">{fmt(suggestion.price)}</span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
                        {suggestion.name}
                      </p>

                      <p className="mt-1 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
                        {suggestion.comboReason}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Link
                          href={`/marketplace/${suggestion.storeSlug}`}
                          className="min-w-0 text-xs font-medium text-gray-500 transition-colors hover:text-primary dark:text-gray-400"
                        >
                          <span className="truncate">{suggestion.storeName}</span>
                          {suggestion.storeZone ? ` · ${suggestion.storeZone}` : ""}
                        </Link>

                        <button
                          onClick={() => {
                            onAddSuggestion(suggestion);
                            setAddedStoreProductId(suggestion.storeProductId);
                            window.setTimeout(() => {
                              setAddedStoreProductId((current) =>
                                current === suggestion.storeProductId ? null : current,
                              );
                            }, 1200);
                          }}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-white transition-all hover:bg-primary/90"
                        >
                          {wasAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          {wasAdded ? "Agregado" : "Sumar combo"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
      </div>
    </section>
  );
}