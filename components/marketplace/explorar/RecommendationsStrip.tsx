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

export default function RecommendationsStrip() {
  const [stores, setStores] = useState<RecommendedStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return () => {
      cancelled = true;
    };
  }, []);

  // No renderizar nada si no hay tiendas y ya terminó de cargar
  if (!loading && stores.length === 0) return null;

  return (
    <section
      aria-labelledby="tiendas-cerca-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8 flex items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
            Cerca tuyo
          </span>
          <h2
            id="tiendas-cerca-heading"
            className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]"
          >
            Tiendas destacadas cerca tuyo
          </h2>
        </div>
        <Link
          href="/marketplace"
          className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:underline shrink-0"
        >
          Ver todas
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
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
                  />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
