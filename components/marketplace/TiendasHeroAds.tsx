"use client";

/**
 * TiendasHeroAds — Carrusel de banners promocionales en `/tiendas`.
 *
 * Reescrito 2026-04-26:
 *   - Usa PromoBannerRenderer (mismo render que el preview de superadmin)
 *   - Soporta los 3 tipos: classic, image, promo (con compra directa)
 *   - Mantiene rotación automática 6s + dots + flechas
 *
 * Lee del slot `tiendas-hero` via `/api/marketplace/promo-banners`.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import PromoBannerRenderer, { type PromoBanner } from "./PromoBannerRenderer";

const ROTATE_MS = 6000;

export default function TiendasHeroAds() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/promo-banners?slot=tiendas-hero", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.banners ?? []) as PromoBanner[];
        const filtered = list.filter((b) => b.active).sort((a, b) => a.order - b.order);
        setBanners(filtered);
      })
      .catch(() => setBanners([]));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (paused || banners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setActive((i) => (i + 1) % banners.length);
    }, ROTATE_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, banners.length]);

  if (banners.length === 0) return null;
  const current = banners[active];

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-5">
      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="region"
        aria-label="Promociones destacadas"
      >
        <PromoBannerRenderer banner={current} />

        {banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((i) => (i - 1 + banners.length) % banners.length)}
              aria-label="Banner anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur text-[var(--text-primary)] hover:bg-white shadow-sm z-10"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % banners.length)}
              aria-label="Banner siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur text-[var(--text-primary)] hover:bg-white shadow-sm z-10"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Ir al banner ${i + 1}`}
                  aria-current={i === active}
                  className={`h-1.5 rounded-full transition-all ${
                    i === active ? "w-8 bg-white" : "w-1.5 bg-white/60 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
