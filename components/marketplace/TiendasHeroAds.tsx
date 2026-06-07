"use client";

/**
 * TiendasHeroAds — Fila ÚNICA de banners promocionales en `/tiendas`.
 *
 * Rediseño 2026-06-06 (Brandon): se eliminó el hero gigante rotante + grid
 * "Más ofertas" separado. Ahora TODAS las promos van en una sola fila
 * uniforme que llena el ancho:
 *   - 1 promo  → 1 columna       - 3 promos → 3 columnas
 *   - 2 promos → 2 columnas      - 4 promos → 4 columnas (2×2 en tablet)
 *   - 5+ promos → scroll horizontal (snap) para que no se achiquen.
 *   - En mobile siempre es una fila deslizable (swipe).
 *
 * Lee del slot `tiendas-hero` (o el pasado) via `/api/marketplace/promo-banners`.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Tag } from "@buleje/design-system/icons";
import { type PromoBanner } from "./PromoBannerRenderer";
import { cn } from "@/lib/utils";

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
 * PromoMiniCard — tarjeta uniforme de promo (imageUrl o gradiente bgFrom→bgTo +
 * título + subtítulo + CTA). Todas las cards de la fila usan este mismo render.
 */
function PromoMiniCard({ banner }: { banner: PromoBanner }) {
  const hasImage = !!banner.imageUrl;
  return (
    <Link
      href={banner.ctaHref || "#"}
      aria-label={banner.title || "Oferta"}
      onClick={() => trackBanner("click", [banner.id])}
      className="group relative block h-full aspect-[16/10] overflow-hidden rounded-2xl border border-[var(--rule-base)] transition-all duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={
        hasImage
          ? undefined
          : { background: `linear-gradient(135deg, ${banner.bgFrom || "#00A0A0"}, ${banner.bgTo || "#0d3b3b"})` }
      }
    >
      {banner.imageUrl && (
        <Image
          src={banner.imageUrl}
          alt={banner.title || "Oferta"}
          fill
          sizes="(min-width: 1280px) 420px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 82vw"
          loading="lazy"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
      )}
      {/* Decoración para gradiente sin imagen — blobs + grilla de puntos. */}
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
      {/* Scrim para legibilidad del texto */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      {/* Badge superior */}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-primary)] shadow-sm backdrop-blur">
        <Tag className="h-3 w-3" strokeWidth={2.75} aria-hidden />
        Oferta
      </span>
      {/* Contenido inferior */}
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
  /** Título de la sección. */
  moreLabel?: string;
}

export default function TiendasHeroAds({
  slot = "tiendas-hero",
  zone = null,
}: TiendasHeroAdsProps = {}) {
  const [banners, setBanners] = useState<PromoBanner[]>([]);

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

  if (banners.length === 0) return null;

  const count = banners.length;
  // 5+ promos → scroll horizontal en todos los breakpoints (no se achican).
  const useScroll = count >= 5;

  // Columnas en desktop (sm+) cuando NO es scroll. Llenan TODO el ancho.
  const cols =
    count === 1 ? "sm:grid-cols-1"
      : count === 2 ? "sm:grid-cols-2"
        : count === 3 ? "sm:grid-cols-3"
          : "sm:grid-cols-2 lg:grid-cols-4"; // 4 → 2×2 en tablet, 1 fila en desktop

  return (
    <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-5" aria-label="Promociones destacadas">
      <div
        className={cn(
          // Mobile: siempre una fila deslizable (swipe).
          "flex gap-3 lg:gap-4 overflow-x-auto snap-x snap-mandatory pb-1",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Desktop: grid de una fila uniforme (salvo 5+ → sigue scroll).
          !useScroll && cn("sm:grid sm:overflow-visible sm:snap-none sm:pb-0", cols),
        )}
      >
        {banners.map((b) => (
          <div
            key={b.id}
            className={cn(
              "snap-start shrink-0",
              useScroll
                ? "w-[82%] sm:w-[46%] lg:w-[31%] xl:w-[23.5%]"
                : "w-[82%] sm:w-auto",
            )}
          >
            <PromoMiniCard banner={b} />
          </div>
        ))}
      </div>
    </section>
  );
}
