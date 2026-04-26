"use client";

/**
 * StorePromoBannersStrip — Strip de banners promocionales gestionado por
 * la tienda desde su admin (StoreBanner.section="promo"). Carrusel
 * horizontal con scroll snap, decoración Buleje. Si no hay banners
 * activos, no renderiza nada.
 *
 * Endpoint: GET /api/marketplace/stores/{slug}/banners?section=promo
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface StorePromoBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  section: string;
  position: number;
  isActive: boolean;
}

interface StorePromoBannersStripProps {
  storeSlug: string;
  storeName: string;
}

export default function StorePromoBannersStrip({
  storeSlug,
  storeName,
}: StorePromoBannersStripProps) {
  const [banners, setBanners] = useState<StorePromoBanner[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketplace/stores/${storeSlug}/banners?section=promo`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.banners ?? []) as StorePromoBanner[];
        setBanners(
          list
            .filter((b) => b.isActive)
            .sort((a, b) => a.position - b.position),
        );
      })
      .catch(() => setBanners([]));
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  if (banners.length === 0) return null;

  return (
    <section
      aria-label={`Promociones de ${storeName}`}
      className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6"
    >
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-1">
            Promociones de la tienda
          </p>
          <h3 className="text-lg sm:text-xl font-black tracking-[-0.015em] text-[var(--text-primary)]">
            Lo que está en oferta hoy
          </h3>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2">
        {banners.map((b) => {
          const Inner = (
            <div className="relative aspect-[16/7] w-full rounded-xl overflow-hidden bg-[var(--surface-sunken)]">
              <Image
                src={b.imageUrl}
                alt={b.title}
                fill
                sizes="(min-width: 1024px) 480px, (min-width: 640px) 420px, 300px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-4 sm:p-5 text-white">
                <p className="text-base sm:text-xl font-black tracking-tight drop-shadow-sm leading-tight">
                  {b.title}
                </p>
                {b.subtitle && (
                  <p className="mt-1 text-xs sm:text-sm opacity-95 line-clamp-2">
                    {b.subtitle}
                  </p>
                )}
                {b.linkUrl && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-3 py-1.5 text-xs font-bold w-max">
                    Ver más
                    <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
                  </span>
                )}
              </div>
            </div>
          );
          return (
            <div
              key={b.id}
              className="snap-start shrink-0 w-[300px] sm:w-[420px] lg:w-[480px] border border-[var(--rule-base)] rounded-xl"
            >
              {b.linkUrl ? (
                <Link href={b.linkUrl} className="block group">
                  {Inner}
                </Link>
              ) : (
                Inner
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
