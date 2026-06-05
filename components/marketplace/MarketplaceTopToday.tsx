"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MARKETPLACE_GRID } from "@/components/marketplace/MarketplaceSection";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceEmptyState from "@/components/marketplace/MarketplaceEmptyState";
import { TrendingUp, ArrowUpRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BRAND_GEO } from "@/lib/geo";

/**
 * Visibilidad por breakpoint para que el ranking quede en UNA SOLA FILA que
 * llene el ancho (Brandon 2026-06-01). La sección solo se ve en md+ (oculta en
 * celular), y el grid canónico da 4 cols @md, 5 @lg, 6 @xl → mostramos
 * exactamente esa cantidad y ocultamos el resto (nunca hay 2da fila).
 */
function oneRowVis(i: number): string {
  if (i < 4) return ""; // 0-3 → siempre (4 cols @md = 1 fila)
  if (i === 4) return "hidden lg:block"; // 5ª card aparece @lg
  if (i === 5) return "hidden xl:block"; // 6ª card aparece @xl
  return "hidden"; // 7ª+ nunca (sería 2da fila)
}

interface TopProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  avgRating: number;
  soldUnits?: number;
  badges: string[];
  store: { slug: string; name: string; rating: number; logo: string | null };
}

function normalize(raw: Record<string, unknown>): TopProduct {
  return {
    storeProductId: String(raw.storeProductId),
    productId: Number(raw.productId),
    name: String(raw.name),
    price: Number(raw.price),
    image: (raw.image as string) ?? null,
    unit: (raw.unit as string) ?? null,
    avgRating: Number(raw.avgRating ?? raw.store_rating ?? 0),
    soldUnits: raw.soldUnits != null ? Number(raw.soldUnits) : undefined,
    badges: Array.isArray(raw.badges) ? (raw.badges as string[]) : [],
    store: {
      slug: String((raw.store as { slug?: string })?.slug ?? raw.storeSlug ?? ""),
      name: String((raw.store as { name?: string })?.name ?? raw.storeName ?? ""),
      rating: Number((raw.store as { rating?: number })?.rating ?? 0),
      // top-today → store.logo (objeto); catalog fallback → storeLogo (plano).
      logo:
        ((raw.store as { logo?: string | null })?.logo ??
          (raw.storeLogo as string | null) ??
          null),
    },
  };
}

export default function MarketplaceTopToday() {
  const [items, setItems] = useState<TopProduct[] | null>(null);
  const [windowLabel, setWindowLabel] = useState<"24h" | "7d" | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Hard timeout — if the fetch hangs longer than 10s, surface as error
    // so we can render the empty state instead of a forever-spinning skeleton.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setError(true);
    }, 10_000);

    (async () => {
      try {
        // 1) Try real "top-today" endpoint (ranked by sold units)
        const r = await fetch("/api/marketplace/top-today?limit=10");
        if (r.ok) {
          const d = await r.json();
          if (!cancelled && Array.isArray(d?.items) && d.items.length > 0) {
            setItems(d.items.map(normalize));
            setWindowLabel(d.window === "7d" ? "7d" : "24h");
            return;
          }
        }
        // 2) Fallback: catalog by popularity
        const r2 = await fetch("/api/marketplace/catalog?sort=popular&limit=10");
        if (!r2.ok) throw new Error("catalog failed");
        const d2 = await r2.json();
        if (cancelled) return;
        setItems((d2?.items ?? []).slice(0, 10).map(normalize));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        clearTimeout(timeoutId);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Hide section completely when we know there's nothing to show.
  // (The empty state renders inside the `<section>` below to keep
  // visual hierarchy when something genuinely failed but only on dev/preview;
  // in production with a populated DB this path never triggers.)
  if (error && items === null) {
    if (process.env.NODE_ENV === "production") return null;
    // dev-only diagnostic — never bubbles to real users
  }
  if (items !== null && items.length === 0) return null;

  return (
    // Brandon 2026-06-01: oculto en celular (hidden md:block). El header usa el
    // MISMO formato editorial que "Tiendas destacadas"/"Categorías" (kicker +
    // h2 text-4xl/5xl con palabra en italic serif accent + pill "Ver todo").
    <section
      id="top-today"
      aria-label="Lo más pedido hoy"
      className="hidden md:block bg-[var(--surface-canvas)] py-12 sm:py-20"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3 mb-6 sm:mb-10">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Ranking {windowLabel === "7d" ? "semanal" : "diario"}
            </p>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
              Lo más pedido{" "}
              <span className="italic font-serif text-[var(--accent)]">
                {windowLabel === "7d" ? "esta semana" : "hoy"}
              </span>
            </h2>
          </div>
          <Link
            href="/marketplace?vista=catalogo&sort=popular"
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] transition-all"
          >
            Ver todo
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {error && items === null ? (
          <MarketplaceEmptyState
            eyebrow="Sin datos por ahora"
            title="Aún no podemos mostrar el ranking de hoy"
            description="Refrescá en un momento o explorá el catálogo completo del marketplace mientras tanto."
          />
        ) : items === null ? (
          <div className={MARKETPLACE_GRID} aria-label="Cargando lo más pedido">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn("aspect-[3/4] rounded-2xl skeleton-shimmer", oneRowVis(i))}
              />
            ))}
          </div>
        ) : (
          // Una sola fila que llena el ancho: el grid canónico da 4/5/6 cols
          // (md/lg/xl) y oneRowVis oculta lo que sobra para que nunca baje a
          // una 2da fila. <ol> = ranking semántico.
          <ol className={MARKETPLACE_GRID} aria-label="Lo más pedido hoy">
            {items.map((p, idx) => (
              <li key={p.storeProductId} className={cn("min-w-0", oneRowVis(idx))}>
                <UnifiedProductCard
                  index={idx}
                  variant="top"
                  rank={idx + 1}
                  layout="compact"
                  href={`/marketplace/${p.store.slug}?p=${p.productId}`}
                  product={{
                    id: p.productId,
                    name: p.name,
                    price: p.price,
                    image: p.image,
                    unit: p.unit,
                    storeName: p.store.name,
                    storeSlug: p.store.slug,
                    storeLogo: p.store.logo,
                    storeProductId: p.storeProductId,
                    description:
                      p.soldUnits != null && p.soldUnits > 0
                        ? `${p.soldUnits} vendidos hoy · ranking ${idx + 1}`
                        : `Top ${idx + 1} de hoy en ${BRAND_GEO.city}`,
                    storeRating: p.avgRating,
                  }}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
