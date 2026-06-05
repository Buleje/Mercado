"use client";

/**
 * FeaturedStoresNearby — Sección "Tiendas destacadas cerca tuyo".
 *
 * Comportamiento (Brandon, mayo 2026):
 *   - Solo se monta si el cliente tiene coords (lat/lng). Sin coords → null.
 *   - Pide /api/marketplace/featured-near-me con lat/lng del usuario.
 *   - Top 6 tiendas dentro del radio (default 50 km, env override
 *     NEXT_PUBLIC_FEATURED_RADIUS_KM).
 *   - Hover en card → drawer lateral con productos destacados + add to cart.
 *
 * Multi-ciudad (Pucallpa + Ciudad Constitución): el radio actúa como
 * separador automático. Si vivís en CC, las stores de Pucallpa quedan
 * a 600+ km y no entran al top 6.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, MapPin, ArrowUpRight, Sparkles } from "@buleje/design-system/icons";
import StoreQuickPreviewDrawer from "./StoreQuickPreviewDrawer";
import type { FeaturedNearbyStore } from "@/lib/db/marketplace-featured.db";

interface Props {
  /** Coords del usuario. Si null, la sección no se renderiza. */
  userCoords: { lat: number; lng: number } | null;
  /** Override del radio en km (default lee de env, fallback 50). */
  radiusKm?: number;
}

const HOVER_OPEN_MS = 280;
const HOVER_CLOSE_GRACE_MS = 250;
const SKELETON_KEYS = [0, 1, 2, 3, 4, 5] as const;

function CardSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden animate-pulse">
      <div className="aspect-[16/10] bg-[var(--surface-sunken)]" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 w-3/4 bg-[var(--surface-sunken)] rounded" />
        <div className="h-3 w-1/2 bg-[var(--surface-sunken)] rounded" />
        <div className="h-3 w-2/3 bg-[var(--surface-sunken)] rounded" />
      </div>
    </div>
  );
}

export default function FeaturedStoresNearby({ userCoords, radiusKm }: Props) {
  const [stores, setStores] = useState<FeaturedNearbyStore[] | null>(null);
  const [error, setError] = useState(false);
  const [activeStore, setActiveStore] = useState<FeaturedNearbyStore | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch tiendas — solo si tenemos coords.
  // El reset a null se hace asincrónicamente para no romper la regla
  // "no setState directo en effect body" (cascading renders).
  useEffect(() => {
    if (!userCoords) return;
    let cancelled = false;
    const params = new URLSearchParams({
      lat: String(userCoords.lat),
      lng: String(userCoords.lng),
      limit: "6",
    });
    if (radiusKm) params.set("radiusKm", String(radiusKm));

    queueMicrotask(() => {
      if (!cancelled) {
        setStores(null);
        setError(false);
      }
    });

    fetch(`/api/marketplace/featured-near-me?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { stores: FeaturedNearbyStore[] }) => {
        if (cancelled) return;
        setStores(data.stores ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setStores([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userCoords, radiusKm]);

  // Si no hay coords, la sección queda oculta. No render placeholder
  // porque el storefront ya tiene mil secciones — agregar una vacía
  // confunde más que ayuda. El requisito de Brandon fue explícito.
  if (!userCoords) return null;

  const handleHoverOpen = (store: FeaturedNearbyStore) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      setActiveStore(store);
      setDrawerOpen(true);
    }, HOVER_OPEN_MS);
  };

  const handleHoverLeave = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setDrawerOpen(false);
    }, HOVER_CLOSE_GRACE_MS);
  };

  const handleDrawerClose = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDrawerOpen(false);
  };

  const showSkeleton = stores === null && !error;
  const isEmpty = stores !== null && stores.length === 0;

  // Si está vacía después de fetch (ej. usuario lejos de toda store), también
  // ocultamos la sección — no hay valor en mostrar "0 destacadas" al cliente.
  if (isEmpty) return null;

  return (
    <>
      <section
        aria-labelledby="featured-near-title"
        className="my-8 sm:my-10"
      >
        <div className="flex items-end justify-between mb-4 sm:mb-5">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--brand-primary)] mb-1">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Destacadas cerca tuyo
            </p>
            <h2 id="featured-near-title" className="text-xl sm:text-2xl font-extrabold leading-tight">
              {stores && stores.length > 0
                ? `Las mejores ${stores.length} ${stores.length === 1 ? "tienda" : "tiendas"} a tu alrededor`
                : "Las mejores tiendas a tu alrededor"}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {showSkeleton &&
            SKELETON_KEYS.map((k) => <CardSkeleton key={k} />)}

          {stores?.map((s) => (
            <div
              key={s.id}
              onMouseEnter={() => handleHoverOpen(s)}
              onMouseLeave={handleHoverLeave}
              onFocus={() => handleHoverOpen(s)}
              onBlur={handleHoverLeave}
              className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden transition-all hover:border-[var(--brand-primary)]/40 hover:shadow-lg hover:-translate-y-0.5"
            >
              <Link
                href={`/marketplace/${s.slug}`}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                aria-label={`Ir a ${s.name}`}
              >
                {/* Banner / hero */}
                <div className="relative aspect-[16/10] bg-[var(--surface-sunken)] overflow-hidden">
                  {s.banner ? (
                    <Image
                      src={s.banner}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/25 via-[var(--brand-primary)]/10 to-[var(--brand-secondary)]/15" />
                  )}

                  {/* Distancia (chip) */}
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/65 backdrop-blur-sm px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white">
                    <MapPin className="h-3 w-3" strokeWidth={2.5} />
                    {Number(s.distanceKm).toFixed(1)} km
                  </span>

                  {/* Logo flotante */}
                  {s.logo && (
                    <div className="absolute -bottom-5 left-4 h-12 w-12 rounded-2xl overflow-hidden bg-white ring-2 ring-white shadow-md">
                      <div className="relative h-full w-full">
                        <Image src={s.logo} alt="" fill sizes="48px" className="object-cover" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="px-4 pt-7 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold leading-tight truncate">{s.name}</h3>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 mt-1 text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      strokeWidth={2.5}
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" strokeWidth={2} />
                      {Number(s.rating).toFixed(1)}
                    </span>
                    <span className="text-muted text-xs">({s.reviewCount} reseñas)</span>
                  </div>

                  <p className="mt-2.5 inline-flex items-start gap-1.5 text-sm text-muted leading-snug">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
                    <span className="line-clamp-1">
                      {s.zone ?? s.description ?? "Tienda Buleje"}
                    </span>
                  </p>
                </div>
              </Link>

              {/* Hint visual del hover */}
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
                Pasá el mouse →
              </span>
            </div>
          ))}
        </div>
      </section>

      <div
        onMouseEnter={() => {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onMouseLeave={handleHoverLeave}
      >
        <StoreQuickPreviewDrawer
          store={activeStore}
          open={drawerOpen}
          onClose={handleDrawerClose}
        />
      </div>
    </>
  );
}
