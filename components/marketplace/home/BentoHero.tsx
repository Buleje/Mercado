"use client";

/**
 * BentoHero — bento grid editorial estilo Apple/Amazon Bazaar.
 *
 * Layout 4 cards:
 *   - 1 GRANDE (col-span-2 row-span-2): mensaje principal con CTA.
 *   - 3 chicos: cupon, yape, selva — cada uno con icono y CTA distintivo.
 *
 * Identidad Buleje: surface-raised + accent token + tipografia black,
 * sin sombras heavy. Mantiene el estilo Holded del proyecto.
 *
 * Ubicacion: debajo del PromoBannerCarousel + Quick Access en /marketplace.
 */

import Link from "next/link";
import { ArrowUpRight, Truck, Wallet, Sparkles, Leaf, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getBannersForSlot } from "@/lib/promo-banners";

const SPAN_BY_INDEX = [
  "col-span-2 sm:col-span-2 row-span-2", // 1° = grande
  "col-span-2 sm:col-span-1 row-span-1", // 2°
  "col-span-1 row-span-1",                // 3°
  "col-span-1 row-span-1",                // 4°
];

const ICON_BY_INDEX: LucideIcon[] = [Truck, Sparkles, Wallet, Leaf];

export default function BentoHero() {
  // Lee del JSON storage (slot="bento") — editable desde /superadmin/banners.
  const banners = getBannersForSlot("bento").slice(0, 4);
  if (banners.length === 0) return null;

  return (
    <section
      aria-label="Bento hero editorial"
      className="w-full pt-6 sm:pt-8"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 grid-rows-[140px_140px] sm:grid-rows-[160px_160px] gap-3 sm:gap-4">
          {banners.map((card, i) => {
            const Icon = ICON_BY_INDEX[i] ?? Truck;
            const isLarge = i === 0;
            // Color de texto contrastado vs fondo: si bgFrom es claro (suma RGB > 380), usar primary, sino white
            const bgIsLight = parseInt(card.bgFrom.slice(1), 16) > 0xa0a0a0;
            const textCls = bgIsLight ? "text-[var(--text-primary)]" : "text-white";
            return (
              <Link
                key={card.id}
                href={card.ctaHref}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-transparent p-4 sm:p-5 flex flex-col justify-between",
                  "transition-all duration-200 hover:-translate-y-0.5",
                  SPAN_BY_INDEX[i],
                  textCls,
                )}
                style={
                  card.imageUrl
                    ? { backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { background: `linear-gradient(135deg, ${card.bgFrom}, ${card.bgTo})` }
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon
                    className={cn(
                      isLarge ? "h-7 w-7 sm:h-8 sm:w-8" : "h-5 w-5 sm:h-6 sm:w-6",
                      "shrink-0 opacity-90",
                    )}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <ArrowUpRight
                    className="h-4 w-4 sm:h-5 sm:w-5 opacity-60 transition-transform group-hover:rotate-12 group-hover:opacity-100"
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <div className="space-y-0.5">
                  <h3
                    className={cn(
                      "font-black tracking-[-0.02em] leading-[1.05]",
                      isLarge ? "text-2xl sm:text-3xl lg:text-4xl" : "text-base sm:text-lg",
                    )}
                  >
                    {card.title}
                  </h3>
                  {card.subtitle && (
                    <p
                      className={cn(
                        "leading-snug opacity-85",
                        isLarge ? "text-sm sm:text-base mt-2" : "text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)]",
                      )}
                    >
                      {card.subtitle}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
