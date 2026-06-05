"use client";

/**
 * MarketplaceRightRail — columna DERECHA del marketplace (layout 3-col tipo
 * Facebook): publicidad. Reusa los banners del slot "tiendas-hero" (mismos del
 * banner de /tiendas) renderizados como tarjetas verticales apiladas. Sticky en
 * desktop. Solo /marketplace.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Tag } from "@buleje/design-system/icons";
import { type PromoBanner } from "./PromoBannerRenderer";

export default function MarketplaceRightRail({ zone = null }: { zone?: string | null }) {
  const [banners, setBanners] = useState<PromoBanner[]>([]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ slot: "tiendas-hero" });
    if (zone) qs.set("zone", zone);
    fetch(`/api/marketplace/promo-banners?${qs.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = ((json?.banners ?? []) as PromoBanner[])
          .filter((b) => b.active)
          .sort((a, b) => a.order - b.order);
        setBanners(list);
      })
      .catch(() => {/* fetch no crítico: la sección se oculta o usa fallback */});
    return () => {
      cancelled = true;
    };
  }, [zone]);

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        Publicidad
      </p>
      {banners.slice(0, 6).map((banner) => {
        const hasImage = !!banner.imageUrl;
        return (
          <Link
            key={banner.id}
            href={banner.ctaHref || "#"}
            aria-label={banner.title || "Oferta"}
            className="group relative block aspect-[16/9] overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={
              hasImage
                ? undefined
                : { background: `linear-gradient(135deg, ${banner.bgFrom || "#0f766e"}, ${banner.bgTo || "#0d3b3b"})` }
            }
          >
            {hasImage && (
              <Image
                src={banner.imageUrl as string}
                alt={banner.title || "Oferta"}
                fill
                sizes="300px"
                loading="lazy"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
              />
            )}
            {!hasImage && (
              <>
                <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl transition-colors group-hover:bg-white/25" />
                <div aria-hidden className="pointer-events-none absolute -left-6 -bottom-8 h-24 w-24 rounded-full bg-black/10 blur-xl" />
              </>
            )}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[length:var(--ts-2xs,0.6875rem)] font-black uppercase tracking-wider text-[var(--text-primary)] shadow-sm backdrop-blur">
              <Tag className="h-2.5 w-2.5" strokeWidth={2.75} aria-hidden />
              Oferta
            </span>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="line-clamp-1 text-sm font-extrabold leading-tight text-white drop-shadow-sm">
                {banner.title}
              </p>
              {banner.subtitle && (
                <p className="mt-0.5 line-clamp-1 text-[length:var(--ts-2xs,0.6875rem)] font-medium text-white/85 drop-shadow-sm">
                  {banner.subtitle}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
