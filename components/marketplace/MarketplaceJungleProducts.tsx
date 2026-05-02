"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

interface JungleProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  store: { slug: string; name: string };
}

const JUNGLE_KEYWORDS = ["aguaje", "camu", "acai", "açaí", "ungurahui", "tacacho", "juane", "cocona", "pijuayo", "huito", "castañas"];

const FALLBACK_ITEMS: JungleProduct[] = [
  {
    storeProductId: "fallback-1",
    productId: 0,
    name: "Aguaje fresco de Ucayali",
    price: 8,
    image: null,
    unit: "kg",
    store: { slug: "", name: "Productor local" },
  },
  {
    storeProductId: "fallback-2",
    productId: 0,
    name: "Camu camu en polvo",
    price: 15,
    image: null,
    unit: "200g",
    store: { slug: "", name: "Productor local" },
  },
  {
    storeProductId: "fallback-3",
    productId: 0,
    name: "Pulpa de açaí",
    price: 12,
    image: null,
    unit: "kg",
    store: { slug: "", name: "Productor local" },
  },
  {
    storeProductId: "fallback-4",
    productId: 0,
    name: "Castañas de la amazonía",
    price: 22,
    image: null,
    unit: "500g",
    store: { slug: "", name: "Productor local" },
  },
];

export default function MarketplaceJungleProducts() {
  const [items, setItems] = useState<JungleProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout to avoid forever-spinning skeleton when one of the
    // 6 parallel requests hangs.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setItems(FALLBACK_ITEMS);
    }, 10_000);

    (async () => {
      try {
        // Fetch by keyword matching (one search per keyword, taking first few)
        const results = await Promise.all(
          JUNGLE_KEYWORDS.slice(0, 6).map((kw) =>
            fetch(`/api/marketplace/catalog?q=${encodeURIComponent(kw)}&limit=3`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        );

        if (cancelled) return;

        const allItems: JungleProduct[] = [];
        const seen = new Set<string>();
        for (const res of results) {
          if (!res?.items) continue;
          for (const x of res.items as Record<string, unknown>[]) {
            const spid = String(x.storeProductId);
            if (seen.has(spid)) continue;
            seen.add(spid);
            allItems.push({
              storeProductId: spid,
              productId: Number(x.productId),
              name: String(x.name),
              price: Number(x.price),
              image: (x.image as string) ?? null,
              unit: (x.unit as string) ?? null,
              store: {
                slug: String((x.store as { slug?: string })?.slug ?? ""),
                name: String((x.store as { name?: string })?.name ?? ""),
              },
            });
          }
        }

        setItems(allItems.length > 0 ? allItems.slice(0, 8) : FALLBACK_ITEMS);
      } catch {
        if (!cancelled) setItems(FALLBACK_ITEMS);
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  if (items !== null && items.length === 0) return null;

  return (
    <MarketplaceSection
      id="selva"
      kicker="Pucallpa · Ucayali"
      title="Productos de la selva"
      subtitle="Del árbol al mercado: frutos, granos y especias cultivadas por productores de Ucayali."
      actions={
        <Link
          href="/marketplace?vista=catalogo&q=selva"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
        >
          Ver todos
        </Link>
      }
    >
      {items === null ? (
        <HorizontalCarousel ariaLabel="Cargando productos de la selva" showNav={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl skeleton-shimmer" />
          ))}
        </HorizontalCarousel>
      ) : (
        <HorizontalCarousel ariaLabel="Productos de la selva">
          {items.map((p, i) => (
            <UnifiedProductCard
              key={p.storeProductId}
              product={{
                id: p.productId,
                name: p.name,
                price: p.price,
                image: p.image,
                unit: p.unit,
                storeName: p.store.name,
                storeSlug: p.store.slug,
                storeProductId: p.storeProductId,
                description: "Del arbol al mercado — cosechado por productores de Ucayali.",
                isPeruvian: true,
              }}
              index={i}
              href={
                p.store.slug
                  ? `/marketplace/${p.store.slug}?p=${p.productId}`
                  : undefined
              }
            />
          ))}
        </HorizontalCarousel>
      )}

    </MarketplaceSection>
  );
}
