"use client";

/**
 * CartSuggestions — sección de descubrimiento al final del carrito.
 *
 * Brandon 2026-05-27. Dos bloques:
 *   1. "Tu último antojo" — productos vistos recientemente (localStorage), para
 *      retomar lo que estabas mirando. Link al producto (no quick-add: la
 *      entrada de recientes no guarda los campos de carrito).
 *   2. "Sumá a tu pedido" — cross-sell: trae más productos de las MISMAS
 *      tiendas del carrito, prioriza las categorías que ya estás llevando y
 *      excluye lo que ya está en el carrito. "+" agrega al toque.
 *
 * Self-contained: lee el carrito y los recientes por su cuenta.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, Clock } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard, {
  type UnifiedProductCardProduct,
} from "@/components/marketplace/UnifiedProductCard";
import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface Suggestion {
  productId: number;
  storeProductId: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

export default function CartSuggestions() {
  const { items } = useMarketplaceCart();
  const { items: recent } = useRecentViewed();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Derivar tiendas, categorías y productos ya en el carrito.
  const { stores, cartCats, excludedIds } = useMemo(() => {
    const storeMap = new Map<string, { slug: string; name: string; id: string }>();
    const cats = new Set<string>();
    const ex = new Set<number>();
    for (const it of items) {
      if (it.storeSlug) {
        storeMap.set(it.storeSlug, {
          slug: it.storeSlug,
          name: it.storeName ?? "",
          id: it.storeId ?? "",
        });
      }
      if (it.category) cats.add(String(it.category).toLowerCase());
      ex.add(it.productId);
    }
    return { stores: [...storeMap.values()], cartCats: cats, excludedIds: ex };
  }, [items]);

  useEffect(() => {
    if (stores.length === 0) {
      setSuggestions([]);
      return;
    }
    // Flag `cancelled` en vez de AbortController: evita el ruido "Uncaught
    // AbortError" de React 19 + Fast Refresh (sugerencias son best-effort).
    let cancelled = false;
    // Máx 2 tiendas para acotar requests (multi-vendor).
    Promise.all(
      stores.slice(0, 2).map((s) =>
        fetch(
          `/api/marketplace/catalog?storeSlug=${encodeURIComponent(s.slug)}&sort=popular&limit=12`,
        )
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then((j) => ({ store: s, rows: (j.data ?? []) as Array<Record<string, unknown>> }))
          .catch(() => ({ store: s, rows: [] as Array<Record<string, unknown>> })),
      ),
    ).then((results) => {
      const mapped: Suggestion[] = [];
      for (const { store, rows } of results) {
        for (const p of rows) {
          const pid = Number(p.productId);
          if (excludedIds.has(pid)) continue;
          if (p.stock != null && (p.stock as number) <= 0) continue;
          mapped.push({
            productId: pid,
            storeProductId: String(p.storeProductId),
            name: String(p.name),
            price: Number(p.price) || 0,
            image: (p.image as string | null) ?? null,
            unit: (p.unit as string | null) ?? null,
            category: (p.category as string | null) ?? null,
            stock: (p.stock as number | null) ?? null,
            storeId: (p.storeId as string) ?? store.id,
            storeName: (p.storeName as string) ?? store.name,
            storeSlug: (p.storeSlug as string) ?? store.slug,
          });
        }
      }
      // Prioriza categorías ya en el carrito (más de lo que estás llevando).
      mapped.sort((a, b) => {
        const aIn = cartCats.has((a.category ?? "").toLowerCase()) ? 0 : 1;
        const bIn = cartCats.has((b.category ?? "").toLowerCase()) ? 0 : 1;
        return aIn - bIn;
      });
      const seen = new Set<string>();
      const out: Suggestion[] = [];
      for (const m of mapped) {
        if (seen.has(m.storeProductId)) continue;
        seen.add(m.storeProductId);
        out.push(m);
        if (out.length >= 10) break;
      }
      if (!cancelled) setSuggestions(out);
    }).catch(() => {
      // Sugerencias best-effort: si algo falla, no mostramos nada.
    });
    return () => {
      cancelled = true;
    };
  }, [stores, excludedIds, cartCats]);

  const recentFiltered = useMemo(
    () => recent.filter((r) => !excludedIds.has(r.productId)).slice(0, 10),
    [recent, excludedIds],
  );

  // Mapea las sugerencias al shape del card del catálogo home (UnifiedProductCard
  // trae quick-add + quick view propios → mismo tamaño/UX que el catálogo).
  const crossSellProducts: UnifiedProductCardProduct[] = useMemo(
    () =>
      suggestions.map((s) => ({
        id: s.productId,
        name: s.name,
        price: s.price,
        image: s.image,
        unit: s.unit,
        category: s.category ?? "",
        storeName: s.storeName,
        storeSlug: s.storeSlug,
        storeId: s.storeId,
        storeProductId: s.storeProductId,
        stock: s.stock ?? undefined,
      })),
    [suggestions],
  );

  if (suggestions.length === 0 && recentFiltered.length === 0) return null;

  return (
    <section className="mt-6 sm:mt-8 space-y-6" aria-label="Sugerencias para tu pedido">
      {/* ── Tu último antojo ── */}
      {recentFiltered.length > 0 && (
        <div>
          <SectionHead
            icon={<Clock className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            title="Tu último antojo"
            subtitle="Lo que estabas mirando"
          />
          <HorizontalCarousel ariaLabel="Tu último antojo">
            {recentFiltered.map((r) => (
              <Link
                key={`${r.storeSlug}-${r.productId}`}
                href={`/marketplace/${r.storeSlug}/producto/${r.productId}`}
                className="group/card block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--accent)]/50"
              >
                <div className="relative aspect-square w-full bg-[var(--surface-sunken)] overflow-hidden">
                  {r.image ? (
                    <Image
                      src={r.image}
                      alt={r.name}
                      fill
                      sizes="240px"
                      className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                      unoptimized
                    />
                  ) : (
                    <ProductPhotoFallback name={r.name} size="sm" showName={false} />
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 min-h-[2.5rem] group-hover/card:text-[var(--accent)] transition-colors">
                    {r.name}
                  </p>
                  <p className="text-base font-black text-[var(--text-primary)] tabular-nums leading-none">
                    {fmt(r.price)}
                  </p>
                </div>
              </Link>
            ))}
          </HorizontalCarousel>
        </div>
      )}

      {/* ── Sumá a tu pedido (cross-sell por categoría) — cards tamaño catálogo
           home (UnifiedProductCard: quick-add + quick view). Brandon 2026-06-08. ── */}
      {crossSellProducts.length > 0 && (
        <div>
          <SectionHead
            icon={<Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />}
            title="Sumá a tu pedido"
            subtitle="Más de lo que estás llevando, de tus mismas tiendas"
          />
          <HorizontalCarousel ariaLabel="Sumá a tu pedido">
            {crossSellProducts.map((p, idx) => (
              <UnifiedProductCard
                key={p.storeProductId || p.id}
                index={idx}
                variant="default"
                layout="compact"
                href={`/marketplace/${p.storeSlug}/producto/${p.id}`}
                product={p}
              />
            ))}
          </HorizontalCarousel>
        </div>
      )}
    </section>
  );
}

/* ── Sub-componentes ──────────────────────────────────────────────────────── */

function SectionHead({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
        {icon}
      </span>
      <div className="leading-tight">
        <h2 className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] text-[var(--text-tertiary)] font-medium">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
