"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import DiscoveryBox from "@/components/marketplace/home/DiscoveryBox";
import ComboMiniCard from "@/components/marketplace/home/ComboMiniCard";
import { Sparkles } from "@buleje/design-system/icons";
import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";
import { isValidVertical } from "@/lib/marketplace/verticals";
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

export default function HomeNewArrivals({ boxed = false }: { boxed?: boolean } = {}) {
  const [items, setItems] = useState<UnifiedProductCardProduct[] | null>(null);
  // Brandon 2026-06-12: "Recién llegados" solo se muestra en "Todo" (el page lo
  // gatea con ShowWhenAllVerticals), así que trae lo nuevo de TODO el marketplace.
  const sp = useSearchParams();
  const vRaw = sp.get("v");
  const vertical = isValidVertical(vRaw) ? vRaw!.toLowerCase() : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = vertical
          ? `/api/marketplace/catalog?sort=newest&limit=12&vertical=${encodeURIComponent(vertical)}`
          : "/api/marketplace/catalog?sort=newest&limit=12";
        const r = await fetch(url);
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
  }, [vertical]);

  // Sin productos nuevos → no renderiza nada.
  if (items !== null && items.length === 0) return null;

  // Cards de la CAJA (estilo Combo: ComboMiniCard, sin carrito ni bordes).
  const cards =
    items === null
      ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-md skeleton-shimmer" />
        ))
      : items.map((p, idx) => (
          <ComboMiniCard
            key={p.storeProductId || p.id}
            index={idx}
            href={`/marketplace/${p.storeSlug}?p=${p.id}`}
            product={p}
          />
        ));

  // Brandon 2026-06-12: modo CAJA — va lado a lado con "Ranking semanal".
  if (boxed) {
    return (
      <DiscoveryBox
        eyebrow="Recién llegados"
        title={`Nuevos en ${BRAND_GEO.city}`}
        actionHref="/?sort=newest#catalogo"
        ariaLabel="Nuevos productos"
        icon={<Sparkles className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
      >
        {cards}
      </DiscoveryBox>
    );
  }

  return (
    <section
      aria-label="Nuevos en Buleje"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
    >
      <SectionHeading
        eyebrow="Recién llegados"
        title={`Nuevos en ${BRAND_GEO.city}`}
        actionLabel="Ver todo"
        actionHref="/?sort=newest#catalogo"
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
