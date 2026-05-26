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
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "@buleje/design-system/icons";
import PromoBannerRenderer, { type PromoBanner } from "./PromoBannerRenderer";

const ROTATE_MS = 6000;

/**
 * PromoMiniCard — tarjeta compacta de oferta para la grilla "Más ofertas".
 * Reusa los datos del PromoBanner (imageUrl o gradiente bgFrom→bgTo + título +
 * CTA). Permite ver varias ofertas de un vistazo sin esperar la rotación del hero.
 */
function PromoMiniCard({ banner }: { banner: PromoBanner }) {
  return (
    <Link
      href={banner.ctaHref || "#"}
      aria-label={banner.title || "Oferta"}
      className="group block overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <div
        className="relative aspect-[16/9] w-full overflow-hidden"
        style={banner.imageUrl ? undefined : { background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})` }}
      >
        {banner.imageUrl && (
          <Image
            src={banner.imageUrl}
            alt={banner.title || "Oferta"}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw"
            loading="lazy"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="p-3.5">
        <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{banner.title}</p>
        {banner.subtitle && (
          <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{banner.subtitle}</p>
        )}
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--accent)]">
          {banner.ctaLabel || "Ver oferta"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

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
  // Grid de "Más ofertas": el resto de banners (excluye el que está en el hero)
  // para no duplicar. Solo se muestra si hay 2+ banners.
  const secondary = banners.filter((_, i) => i !== active).slice(0, 6);

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

      {/* Grid "Más ofertas" — ver varias promos de un vistazo (Fase 1 banners v2) */}
      {secondary.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Más ofertas</h2>
            <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {banners.length} promos activas
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
            {secondary.map((b) => (
              <PromoMiniCard key={b.id} banner={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
