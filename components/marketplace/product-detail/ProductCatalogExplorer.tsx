"use client";

/**
 * ProductCatalogExplorer — "Explorá según tus gustos".
 *
 * Catálogo navegable de la tienda DEBAJO de "También te puede interesar": chips
 * por categoría + grid de productos, para que el cliente siga descubriendo sin
 * salir del PDP. Reusa UnifiedProductCard (misma tarjeta del marketplace).
 *
 * Datos: GET /api/marketplace/catalog?storeSlug=…&limit=40 (mismo endpoint del
 * catálogo público). Categorías derivadas de los productos devueltos.
 */

import { useState, useEffect, useMemo } from "react";
import { Kicker, SectionTitle } from "@buleje/design-system";
import { Loader2, LayoutGrid } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import UnifiedProductCard, { type UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

interface Props {
  storeSlug: string;
  storeName: string;
  currentProductId: number;
  /** Categoría activa (controlado por el padre p/ compartir con la sidebar). */
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  /** Reporta las categorías derivadas al padre (para la sidebar de navegación). */
  onCategoriesLoaded?: (categories: string[]) => void;
}

export const CATALOG_ALL = "__todos__";

type CatProduct = {
  id: number;
  name: string;
  price: number;
  originalPrice?: number;
  image: string | null;
  category: string | null;
  storeSlug?: string;
  storeProductId?: string;
  unit?: string | null;
  stock?: number;
};

function norm(raw: Record<string, unknown>): CatProduct {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
  return {
    id: Number(raw.id ?? raw.productId),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    originalPrice: raw.originalPrice != null ? Number(raw.originalPrice) : undefined,
    image: (raw.image as string) ?? images[0] ?? null,
    category: (raw.category as string) ?? null,
    storeSlug: (raw.storeSlug as string) ?? (store.slug as string) ?? undefined,
    storeProductId: (raw.storeProductId as string) ?? undefined,
    unit: (raw.unit as string) ?? null,
    stock: raw.stock != null ? Number(raw.stock) : undefined,
  };
}

const ALL = CATALOG_ALL;

export function ProductCatalogExplorer({
  storeSlug,
  storeName,
  currentProductId,
  activeCategory,
  onCategoryChange,
  onCategoriesLoaded,
}: Props) {
  const [products, setProducts] = useState<CatProduct[] | null>(null);
  const [internalActive, setInternalActive] = useState<string>(ALL);
  // Controlado por el padre si pasa activeCategory/onCategoryChange; si no, local.
  const active = activeCategory ?? internalActive;
  const setActive = onCategoryChange ?? setInternalActive;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketplace/catalog?storeSlug=${encodeURIComponent(storeSlug)}&limit=40`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j?.items) ? j.items : [];
        const list = (raw as Record<string, unknown>[])
          .map(norm)
          .filter((p) => p.id && p.id !== currentProductId && p.name);
        setProducts(list);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [storeSlug, currentProductId]);

  const categories = useMemo(() => {
    if (!products) return [];
    const set = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      set.set(p.category, (set.get(p.category) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [products]);

  // Reporta las categorías al padre para alimentar la sidebar de navegación.
  useEffect(() => {
    if (categories.length) onCategoriesLoaded?.(categories);
  }, [categories, onCategoriesLoaded]);

  const filtered = useMemo(() => {
    if (!products) return [];
    return active === ALL ? products : products.filter((p) => p.category === active);
  }, [products, active]);

  if (products === null) {
    return (
      <section aria-label="Cargando catálogo" className="space-y-4">
        <div className="h-7 w-64 animate-pulse bg-[var(--surface-sunken)]" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse bg-[var(--surface-sunken)]" />
          ))}
        </div>
      </section>
    );
  }
  if (products.length === 0) return null;

  return (
    <section aria-label="Explorá el catálogo" className="space-y-4">
      <div>
        <Kicker as="p">Explorá según tus gustos</Kicker>
        <SectionTitle as="h2">Más del catálogo de {storeName}</SectionTitle>
      </div>

      {/* Chips por categoría */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[ALL, ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              aria-pressed={active === c}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 h-9 text-sm font-medium capitalize transition-colors",
                active === c
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50",
              )}
            >
              {c === ALL ? <><LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Todos</> : c.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {/* Grid — misma grilla densa que el catálogo del inicio (CatalogView). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
        {filtered.slice(0, 21).map((p, index) => {
          const card: UnifiedProductCardProduct = {
            id: p.id,
            name: p.name,
            price: p.price,
            originalPrice: p.originalPrice,
            image: p.image,
            storeName,
            storeSlug: p.storeSlug ?? storeSlug,
            storeProductId: p.storeProductId,
            unit: p.unit,
            category: p.category ?? undefined,
            stock: p.stock,
          };
          return (
            <UnifiedProductCard
              key={p.id}
              product={card}
              index={index}
              href={`/marketplace/${p.storeSlug ?? storeSlug}/producto/${p.id}`}
            />
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          No hay productos en esta categoría.
        </p>
      )}
    </section>
  );
}
