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
import { ChevronLeft, ChevronRight, ArrowRight, Tag } from "@buleje/design-system/icons";
import PromoBannerRenderer, { type PromoBanner } from "./PromoBannerRenderer";

const ROTATE_MS = 6000;

// banners v2 F3: tracking fire-and-forget (sendBeacon, no bloquea navegación).
function trackBanner(event: "impression" | "click", ids: string[]) {
  if (typeof navigator === "undefined" || ids.length === 0) return;
  const body = JSON.stringify(
    event === "impression" ? { event, bannerIds: ids } : { event, bannerId: ids[0] },
  );
  try {
    const url = "/api/marketplace/promo-banners/track";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch { /* fire-and-forget */ }
}

/**
 * PromoMiniCard — tarjeta compacta de oferta para la grilla "Más ofertas".
 * Reusa los datos del PromoBanner (imageUrl o gradiente bgFrom→bgTo + título +
 * CTA). Permite ver varias ofertas de un vistazo sin esperar la rotación del hero.
 */
function PromoMiniCard({ banner }: { banner: PromoBanner }) {
  const hasImage = !!banner.imageUrl;
  return (
    <Link
      href={banner.ctaHref || "#"}
      aria-label={banner.title || "Oferta"}
      onClick={() => trackBanner("click", [banner.id])}
      className="group relative block aspect-[16/10] overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={
        hasImage
          ? undefined
          : { background: `linear-gradient(135deg, ${banner.bgFrom || "#0f766e"}, ${banner.bgTo || "#0d3b3b"})` }
      }
    >
      {banner.imageUrl && (
        <Image
          src={banner.imageUrl}
          alt={banner.title || "Oferta"}
          fill
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 33vw, 50vw"
          loading="lazy"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
      )}
      {/* Decoración para gradiente sin imagen — blobs + grilla de puntos
          (saca la sensación de "rectángulo plano de color"). */}
      {!hasImage && (
        <>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl transition-colors group-hover:bg-white/25" />
          <div aria-hidden className="pointer-events-none absolute -left-8 -bottom-10 h-28 w-28 rounded-full bg-black/10 blur-xl" />
          <div
            aria-hidden
            className="pointer-events-none absolute right-3 top-3 h-14 w-14 opacity-40"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.65) 1.5px, transparent 1.5px)", backgroundSize: "9px 9px" }}
          />
        </>
      )}
      {/* Scrim para legibilidad del texto sobre imagen/gradiente */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      {/* Badge superior */}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-primary)] shadow-sm backdrop-blur">
        <Tag className="h-3 w-3" strokeWidth={2.75} aria-hidden />
        Oferta
      </span>
      {/* Contenido inferior — título + subtítulo + CTA sólido */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="line-clamp-1 text-base sm:text-lg font-extrabold leading-tight text-white drop-shadow-sm">
          {banner.title}
        </p>
        {banner.subtitle && (
          <p className="mt-0.5 line-clamp-1 text-sm font-medium text-white/85 drop-shadow-sm">{banner.subtitle}</p>
        )}
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-extrabold text-[var(--text-primary)] shadow-md transition-all group-hover:gap-2.5">
          {banner.ctaLabel || "Ver oferta"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

interface TiendasHeroAdsProps {
  /** Slot de banners (banners v2 F4 multi-slot). Default "tiendas-hero". */
  slot?: string;
  /** Zona del cliente para segmentación (banners v2 F4). */
  zone?: string | null;
  /** Título de la sección de ofertas secundarias. */
  moreLabel?: string;
}

export default function TiendasHeroAds({ slot = "tiendas-hero", zone = null, moreLabel = "Más ofertas" }: TiendasHeroAdsProps = {}) {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ slot });
    if (zone) qs.set("zone", zone);
    fetch(`/api/marketplace/promo-banners?${qs.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.banners ?? []) as PromoBanner[];
        const filtered = list.filter((b) => b.active).sort((a, b) => a.order - b.order);
        setBanners(filtered);
        // F3: una impresión batch por los banners servidos (1 vez por carga).
        trackBanner("impression", filtered.map((b) => b.id));
      })
      .catch(() => setBanners([]));
    return () => { cancelled = true; };
  }, [slot, zone]);

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
    <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-5">
      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        role="region"
        aria-label="Promociones destacadas"
        onClickCapture={() => trackBanner("click", [current.id])}
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
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">{moreLabel}</h2>
            <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {banners.length} promos activas
            </span>
          </div>
          {/* Grid adaptativo: las cards rellenan TODO el ancho según cuántas
              haya. 3 banners → 3 columnas (sin hueco); 4+ → hasta 4. */}
          <div
            className={`grid grid-cols-2 gap-3 lg:gap-4 ${
              secondary.length === 3
                ? "sm:grid-cols-3"
                : secondary.length === 2
                  ? "sm:grid-cols-2"
                  : secondary.length === 1
                    ? "grid-cols-1"
                    : "sm:grid-cols-3 lg:grid-cols-4"
            }`}
          >
            {secondary.map((b) => (
              <PromoMiniCard key={b.id} banner={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
