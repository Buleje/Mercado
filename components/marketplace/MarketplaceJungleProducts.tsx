"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { m } from "framer-motion";
import { Leaf, MapPin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import MarketplaceSection, { MARKETPLACE_GRID } from "@/components/marketplace/MarketplaceSection";

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
      }
    })();
    return () => {
      cancelled = true;
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
          className="text-xs font-bold text-gray-900 dark:text-white link-underline whitespace-nowrap"
        >
          Ver todos
        </Link>
      }
    >
      {items === null ? (
        <div className={MARKETPLACE_GRID}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl skeleton-shimmer"
            />
          ))}
        </div>
      ) : (
        <m.div
              className={MARKETPLACE_GRID}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.15 }}
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.08, delayChildren: 0.05 },
                },
              }}
            >
              {items.map((p) => (
                <m.div
                  key={p.storeProductId}
                  variants={{
                    hidden: { opacity: 0, y: 18 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{ type: "spring", stiffness: 280, damping: 22 }}
                >
                <Link
                  href={
                    p.store.slug
                      ? `/marketplace/${p.store.slug}?p=${p.productId}`
                      : "/marketplace"
                  }
                  className="group block bg-white dark:bg-gray-950 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-gray-500 transition-all"
                >
                  <div className="relative aspect-square bg-gray-50 dark:bg-gray-900 overflow-hidden">
                    {p.image ? (
                      <Image
                        src={p.image}
                        alt={p.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-300 dark:text-gray-700">
                        <Leaf className="h-10 w-10" strokeWidth={1.25} />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/95 backdrop-blur border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
                      <Leaf className="h-2.5 w-2.5" strokeWidth={2} />
                      Selva
                    </span>
                  </div>
                  <div className="p-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold tracking-tight text-gray-900 dark:text-white line-clamp-2 min-h-[2.25rem]">
                      {p.name}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-base font-extrabold text-gray-900 dark:text-white tabular-nums">
                        S/{p.price.toFixed(2)}
                      </span>
                      {p.unit && (
                        <span className="text-[length:var(--ts-2xs)] text-gray-400 tabular-nums">/ {p.unit}</span>
                      )}
                    </div>
                  </div>
                </Link>
                </m.div>
              ))}
            </m.div>
          )}

    </MarketplaceSection>
  );
}
