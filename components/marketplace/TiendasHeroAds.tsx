"use client";

/**
 * TiendasHeroAds — Banner de promociones rotantes en `/tiendas` debajo del
 * buscador. Lee del slot `tiendas-hero` del file `lib/data/promo-banners.json`.
 *
 * Comportamiento:
 *   - Carrusel auto-rotante cada 6s.
 *   - Pausa al hover.
 *   - Indicador de progreso + dots clicables.
 *   - Scroll horizontal nativo en mobile (snap).
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

interface PromoBanner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  ctaHref: string;
  ctaLabel: string;
  bgFrom: string;
  bgTo: string;
  active: boolean;
  order: number;
}

const ROTATE_MS = 6000;

export default function TiendasHeroAds() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/promo-banners?slot=tiendas-hero", {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.banners ?? []) as PromoBanner[];
        const filtered = list.filter((b) => b.active).sort((a, b) => a.order - b.order);
        setBanners(filtered);
      })
      .catch(() => setBanners([]));
    return () => {
      cancelled = true;
    };
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
        className="relative overflow-hidden rounded-2xl shadow-sm border border-[var(--rule-base)]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="region"
        aria-label="Promociones destacadas"
      >
        {/* Banner con imagen o gradiente */}
        <Link
          href={current.ctaHref}
          className="block relative aspect-[5/2] sm:aspect-[3/1] min-h-[220px] sm:min-h-[300px] overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${current.bgFrom}, ${current.bgTo})`,
          }}
        >
          {current.imageUrl && (
            <Image
              src={current.imageUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 1280px) 1280px, 100vw"
              className="object-cover"
            />
          )}
          {/* Decoración geométrica */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -bottom-16 h-40 w-40 rounded-full bg-white/5"
          />

          <div className="relative h-full flex items-center px-6 sm:px-10">
            <div className="max-w-xl text-white">
              <h3 className="text-2xl sm:text-4xl font-black tracking-[-0.02em] leading-[1.05] drop-shadow-sm">
                {current.title}
              </h3>
              {current.subtitle && (
                <p className="mt-2 text-sm sm:text-lg opacity-95 drop-shadow-sm">
                  {current.subtitle}
                </p>
              )}
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-4 py-2 text-sm font-bold hover:bg-white/30 transition-colors">
                {current.ctaLabel}
                <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </span>
            </div>
          </div>
        </Link>

        {/* Controles solo si hay > 1 banner */}
        {banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setActive((i) => (i - 1 + banners.length) % banners.length)
              }
              aria-label="Banner anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur text-[var(--text-primary)] hover:bg-white shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setActive((i) => (i + 1) % banners.length)}
              aria-label="Banner siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur text-[var(--text-primary)] hover:bg-white shadow-sm"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Ir al banner ${i + 1}`}
                  aria-current={i === active}
                  className={`h-1.5 rounded-full transition-all ${
                    i === active
                      ? "w-8 bg-white"
                      : "w-1.5 bg-white/50 hover:bg-white/70"
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
