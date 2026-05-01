"use client";

/**
 * RecommendationsStrip — Horizontal scroll de tiendas destacadas cerca.
 * Data-driven: consume /api/marketplace/recommendations/for-me.
 * Scroll-snap horizontal en mobile, grid limpio en desktop.
 *
 * Migrado de ilustraciones hardcoded a StoreCardCanonical variant="compact"
 * (ADR-075 Fase 2). El canonical rota ilustraciones deterministicamente
 * via StoreImagePlaceholder cuando no hay logo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "@buleje/design-system/icons";
import { StoreCardCanonical } from "@buleje/design-system";
import MiniBulejeBanner from "@/components/marketplace/MiniBulejeBanner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface RecommendedStore {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  zone?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function StoreCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="snap-start shrink-0 w-48 sm:w-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden animate-pulse"
    >
      <div className="aspect-[4/3] bg-[var(--surface-sunken)]" />
      <div className="p-2 space-y-2">
        <div className="h-3 bg-[var(--surface-sunken)] rounded w-3/4" />
        <div className="h-2.5 bg-[var(--surface-sunken)] rounded w-1/2" />
      </div>
    </div>
  );
}

// ── Componente ─────────────────────────────────────────────────────────────────

interface RecommendationsStripProps {
  /** Stores pre-fetched server-side. Si se pasa, se evita el client-side fetch
   *  y el strip muestra la data inmediatamente (sin skeletons). Soluciona el
   *  bug de skeletons eternos cuando Next 16 preserva el árbol cliente y el
   *  useEffect no vuelve a correr tras navegación. */
  initialStores?: RecommendedStore[];
}

export default function RecommendationsStrip({ initialStores }: RecommendationsStripProps = {}) {
  const [stores, setStores] = useState<RecommendedStore[]>(initialStores ?? []);
  const [loading, setLoading] = useState(!initialStores);

  useEffect(() => {
    // Si ya tenemos initialStores, no fetcheamos.
    if (initialStores && initialStores.length > 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/marketplace/stores?limit=6");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { data: RecommendedStore[] };
        if (!cancelled) setStores(json.data ?? []);
      } catch {
        /* silent fail — strip simplemente no aparece si el endpoint falla */
        if (!cancelled) setStores([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Watchdog: si tras 3s el componente sigue en loading sin stores,
    // re-disparamos un fetch (cubre casos donde el primer fetch quedó stale
    // por Next 16 client cache).
    const watchdog = setTimeout(() => {
      if (!cancelled && stores.length === 0) {
        load();
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No renderizar nada si no hay tiendas y ya terminó de cargar
  if (!loading && stores.length === 0) return null;

  return (
    <section
      aria-labelledby="tiendas-cerca-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            <span
              aria-hidden
              className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]"
            />
            Cerca tuyo
          </p>
          <h2
            id="tiendas-cerca-heading"
            className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-[1.05]"
          >
            Tiendas destacadas cerca tuyo
          </h2>
        </div>
        <Link
          href="/marketplace"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
        >
          Ver todas
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </header>

      {/* Mobile: horizontal scroll con snap. Desktop: grid */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto sm:overflow-visible scrollbar-none">
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 px-4 sm:px-0 snap-x snap-mandatory sm:snap-none">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <StoreCardSkeleton key={i} />)
            : stores.map((store) => (
                <div key={store.id} className="snap-start shrink-0 w-48 sm:w-auto">
                  <StoreCardCanonical
                    storeId={store.id}
                    name={store.name}
                    slug={store.slug}
                    imageUrl={store.logo}
                    variant="compact"
                    footer={
                      store.zone ? (
                        <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {store.zone}
                        </span>
                      ) : undefined
                    }
                    renderImage={({ src, alt, className }) => (
                      <Image
                        src={src}
                        alt={alt}
                        fill
                        className={className}
                        sizes="(max-width:640px) 192px, 240px"
                      />
                    )}
                    renderImageFallback={() => (
                      <MiniBulejeBanner
                        storeName={store.name}
                        category={store.category}
                      />
                    )}
                  />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
