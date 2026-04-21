"use client";

/**
 * PromoBannerCarousel — banner rotativo reusable para top de pages.
 *
 * Muestra 3 banners (o los configurados en lib/promo-banners.ts) y rota
 * cada N segundos (8 default). Si solo hay 1 banner, no rota.
 *
 * Cuando no hay imageUrl, renderea un placeholder con título + subtítulo
 * sobre gradient de fondo (configurable por banner via bgFrom/bgTo).
 *
 * Diseño consistente con el banner placeholder de /explorar:
 * aspect-[16/9] mobile, aspect-[4/1] desktop, rounded-2xl, indicators bottom.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ImageIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getBannersForSlot, type PromoBannerSlot, type PromoBanner } from "@/lib/promo-banners";

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
        <Link
          href={current.ctaHref}
          className="group block relative overflow-hidden rounded-2xl aspect-[16/9] sm:aspect-[3/1] lg:aspect-[4/1] transition-shadow"
          style={
            current.imageUrl
              ? undefined
              : {
                  background: `linear-gradient(135deg, ${current.bgFrom}, ${current.bgTo})`,
                }
          }
        >
          {current.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.imageUrl}
              alt={current.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            // Placeholder: text-only sobre gradient + ilustracion sutil
            <div className="absolute inset-0 flex flex-col sm:flex-row items-center justify-between gap-6 px-6 sm:px-12 py-6">
              <div className="flex-1 text-left max-w-2xl">
                <h2 className="text-[clamp(1.5rem,4vw,3rem)] font-black text-[#0c1015] tracking-[-0.025em] leading-[1.05]">
                  {current.title}
                </h2>
                {current.subtitle && (
                  <p className="mt-3 text-base sm:text-lg text-[#0c1015]/75 leading-snug max-w-xl">
                    {current.subtitle}
                  </p>
                )}
                <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0c1015] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/10 group-hover:gap-3 transition-all">
                  {current.ctaLabel}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </span>
              </div>
              <div className="hidden sm:flex h-24 w-24 lg:h-32 lg:w-32 shrink-0 items-center justify-center rounded-full bg-white/60 text-[#0c1015]/40">
                <ImageIcon className="h-12 w-12 lg:h-16 lg:w-16" strokeWidth={1.25} aria-hidden />
              </div>
            </div>
          )}
        </Link>

        {/* Indicators (solo si hay >1 banners) */}
        {banners.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Banner ${i + 1}`}
                aria-current={i === idx}
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
