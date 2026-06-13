"use client";

/**
 * HomeCatalogStrip — caja de descubrimiento GENÉRICA (Brandon 2026-06-12).
 * Trae productos de un endpoint de catálogo y los muestra en un DiscoveryBox
 * (misma temática que "Recién llegados" / "Ranking"): 3 cards + flechas. Se
 * auto-oculta si no hay productos. Usada para "Ofertas" y "Paquetes".
 */

import { useEffect, useState, type ReactNode } from "react";
import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";
import DiscoveryBox from "@/components/marketplace/home/DiscoveryBox";

function normalize(raw: Record<string, unknown>): UnifiedProductCardProduct {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
  return {
    id: Number(raw.productId ?? raw.id),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    originalPrice:
      raw.originalPrice != null ? Number(raw.originalPrice) : undefined,
    discount: raw.discount != null ? Number(raw.discount) : undefined,
    image: (raw.image as string) ?? images[0] ?? null,
    unit: (raw.unit as string) ?? null,
    description: (raw.description as string) ?? null,
    storeName: String(raw.storeName ?? store.name ?? ""),
    storeSlug: String(raw.storeSlug ?? store.slug ?? ""),
    storeId: String(raw.storeId ?? store.id ?? ""),
    storeProductId: String(raw.storeProductId ?? ""),
    storeLogo: (raw.storeLogo as string) ?? (store.logo as string) ?? null,
    storeRating: Number(raw.avgRating ?? store.rating ?? 0),
    category: String(raw.category ?? ""),
    stock: raw.stock != null ? Number(raw.stock) : undefined,
  };
}

interface Props {
  fetchUrl: string;
  eyebrow: string;
  title: string;
  actionHref: string;
  ariaLabel: string;
  /** Ícono del chip del header (identidad de la caja). */
  icon?: ReactNode;
}

export default function HomeCatalogStrip({
  fetchUrl,
  eyebrow,
  title,
  actionHref,
  ariaLabel,
  icon,
}: Props) {
  const [items, setItems] = useState<UnifiedProductCardProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(fetchUrl);
        if (!r.ok) throw new Error("catalog strip failed");
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
  }, [fetchUrl]);

  // Sin productos → no renderiza (la fila se auto-balancea).
  if (items !== null && items.length === 0) return null;

  const cards =
    items === null
      ? Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-2xl skeleton-shimmer" />
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
        ));

  return (
    <DiscoveryBox eyebrow={eyebrow} title={title} actionHref={actionHref} ariaLabel={ariaLabel} icon={icon}>
      {cards}
    </DiscoveryBox>
  );
}
