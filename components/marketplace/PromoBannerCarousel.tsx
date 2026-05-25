"use client";

/**
 * PromoBannerCarousel — banner rotativo reusable para top de pages.
 *
 * Reescrito 2026-04-26 — usa PromoBannerRenderer compartido para garantizar
 * render idéntico al preview de superadmin y a TiendasHeroAds.
 *
 * Soporta los 3 tipos: classic (default legacy), image, promo (compra directa).
 * Rota cada 8s, pausa al hover, indicators en bottom, sin flechas (solo dots).
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getBannersForSlot, type PromoBannerSlot, type PromoBanner } from "@/lib/promo-banners";
import PromoBannerRenderer from "./PromoBannerRenderer";

const ROTATE_MS = 8000;

interface Props {
  slot: PromoBannerSlot;
  /** Override de banners para SSR/testing. */
  banners?: PromoBanner[];
}

export default function PromoBannerCarousel({ slot, banners: override }: Props) {
  const banners = override ?? getBannersForSlot(slot);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || banners.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, banners.length]);

  if (banners.length === 0) return null;

  const current = banners[idx];

  return (
    <section
      aria-label="Banner promocional"
      className="w-full pt-4 sm:pt-6"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <PromoBannerRenderer banner={current} />

        {/* Indicators (solo si hay >1 banners) */}
        {banners.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Ver banner ${i + 1} de ${banners.length}`}
                aria-pressed={i === idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === idx
                    ? "w-8 bg-[var(--text-primary)]"
                    : "w-2 bg-[var(--rule-base)] hover:bg-[var(--rule-mid)]",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
