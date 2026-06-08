"use client";

import { useEffect, useState } from "react";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";
import { BRAND_GEO } from "@/lib/geo";

/**
 * HomeNewArrivals — "Nuevos en {ciudad}" (Brandon 2026-06-08). Descubrimiento
 * con DATA REAL: los productos recién agregados al marketplace (catalog?sort=
 * newest). Carrusel horizontal (distinto del grid del ranking y del catálogo).
 * Self-hide si no hay productos. Las cards traen add-to-cart + quick view.
 */

function normalize(raw: Record<string, unknown>): UnifiedProductCardProduct {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
  return {
    id: Number(raw.productId ?? raw.id),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    image: (raw.image as string) ?? images[0] ?? null,
    unit: (raw.unit as string) ?? null,
    storeName: String(raw.storeName ?? store.name ?? ""),
    storeSlug: String(raw.storeSlug ?? store.slug ?? ""),
    storeProductId: String(raw.storeProductId ?? ""),
    storeLogo: (raw.storeLogo as string) ?? (store.logo as string) ?? null,
    storeRating: Number(raw.avgRating ?? store.rating ?? 0),
    category: String(raw.category ?? ""),
  };
}

export default function HomeNewArrivals() {
  const [items, setItems] = useState<UnifiedProductCardProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/marketplace/catalog?sort=newest&limit=12");
        if (!r.ok) throw new Error("catalog newest failed");
        const d = await r.json();
        const raw = Array.isArray(d?.data)
          ? d.data
          : Array.isArray(d?.items)
            ? d.items
            : [];
        if (!cancelled) setItems(raw.map(normalize));
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sin productos nuevos → no renderiza nada.
  if (items !== null && items.length === 0) return null;

  return (
    <section
      aria-label="Nuevos en Buleje"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
    >
      <SectionHeading
        eyebrow="Recién llegados"
        title={`Nuevos en ${BRAND_GEO.city}`}
        actionLabel="Ver todo"
        actionHref="/marketplace/explorar?sort=newest"
      />

      <HorizontalCarousel ariaLabel="Nuevos productos">
        {items === null
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl skeleton-shimmer"
              />
            ))
          : items.map((p, idx) => (
              <UnifiedProductCard
                key={p.storeProductId || p.id}
                index={idx}
                variant="default"
                layout="compact"
                href={`/marketplace/${p.storeSlug}?p=${p.id}`}
                product={p}
              />
            ))}
      </HorizontalCarousel>
    </section>
  );
}
