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
import { ArrowUpRight, Truck, Wallet, Sparkles, Leaf, ChevronRight, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getBannersForSlot, type PromoBanner } from "@/lib/promo-banners";

const SPAN_BY_INDEX = [
  "col-span-2 sm:col-span-2 row-span-2", // 1° = grande
  "col-span-2 sm:col-span-1 row-span-1", // 2°
  "col-span-1 row-span-1",                // 3°
  "col-span-1 row-span-1",                // 4°
];

const ICON_BY_INDEX: LucideIcon[] = [Truck, Sparkles, Wallet, Leaf];

function fmtSoles(v: number): string {
  return `S/ ${v.toFixed(2)}`;
}

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
          {banners.map((card, i) => (
            <BentoCard key={card.id} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * BentoCard — un slot del bento grid. Renderiza distinto según card.type:
 *  - "promo": producto embebido con precio + Comprar
 *  - "image": foto + CTA chip flotante
 *  - "classic" (default): título + subtítulo + flecha
 */
function BentoCard({ card, index }: { card: PromoBanner; index: number }) {
  const Icon = ICON_BY_INDEX[index] ?? Truck;
  const isLarge = index === 0;
  const type = card.type ?? "classic";
  // Color de texto contrastado: si bgFrom es claro, usar primary; sino blanco
  const bgIsLight = parseInt(card.bgFrom.slice(1), 16) > 0xa0a0a0;
  const textCls = bgIsLight ? "text-[var(--text-primary)]" : "text-white";

  const linkHref =
    type === "promo" ? card.promo?.buyHref || card.ctaHref : card.ctaHref;

  // ── PROMO: producto embebido con compra directa ──
  if (type === "promo" && card.promo) {
    const p = card.promo;
    return (
      <Link
        href={linkHref}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-transparent p-3 sm:p-4 flex flex-col gap-2",
          "transition-all duration-200 hover:-translate-y-0.5",
          SPAN_BY_INDEX[index],
          textCls,
        )}
        style={
          card.imageUrl
            ? { backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: `linear-gradient(135deg, ${card.bgFrom}, ${card.bgTo})` }
        }
      >
        {/* Producto image (top) + badge */}
        <div className="flex items-start justify-between gap-2">
          <div className={cn(
            "rounded-xl bg-white/95 overflow-hidden shrink-0 shadow",
            isLarge ? "h-20 w-20 sm:h-28 sm:w-28" : "h-12 w-12 sm:h-14 sm:w-14",
          )}>
            {p.productImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.productImage} alt={p.productName} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[#0c1015]/30">
                <Icon className="h-1/2 w-1/2" />
              </div>
            )}
          </div>
          {p.badge && (
            <span className="inline-flex items-center rounded-full bg-[var(--data-error)] text-white px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow">
              {p.badge}
            </span>
          )}
        </div>
        {/* Info + Comprar */}
        <div className="flex-1 flex flex-col justify-end space-y-1">
          <p className={cn(
            "font-bold tracking-tight leading-tight line-clamp-2",
            isLarge ? "text-base sm:text-lg" : "text-xs sm:text-sm",
          )}>
            {p.productName || card.title}
          </p>
          {p.price !== null && (
            <div className="flex items-baseline gap-1.5">
              <span className={cn(
                "font-display font-extrabold tabular-nums",
                isLarge ? "text-xl sm:text-2xl" : "text-base sm:text-lg",
              )}>
                {fmtSoles(p.price)}
              </span>
              {p.oldPrice !== null && p.oldPrice > p.price && (
                <span className={cn("font-bold tabular-nums line-through opacity-50", isLarge ? "text-sm" : "text-[length:var(--ts-2xs)]")}>
                  {fmtSoles(p.oldPrice)}
                </span>
              )}
            </div>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success)] text-white px-2.5 py-1 text-[length:var(--ts-2xs)] sm:text-xs font-extrabold whitespace-nowrap self-start mt-1 shadow-sm">
            {p.buyLabel || "Comprar"}
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </Link>
    );
  }

  // ── IMAGE: foto + CTA flotante (sin texto fuerte) ──
  if (type === "image" && card.imageUrl) {
    return (
      <Link
        href={linkHref}
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-transparent",
          "transition-all duration-200 hover:-translate-y-0.5",
          SPAN_BY_INDEX[index],
        )}
        style={{ backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        {card.ctaLabel && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 text-[#0c1015] px-2.5 py-1 text-[length:var(--ts-2xs)] sm:text-xs font-extrabold whitespace-nowrap shadow">
            {card.ctaLabel}
            <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </Link>
    );
  }

  // ── CLASSIC (default): título grande + subtítulo + arrow ──
  return (
    <Link
      href={linkHref}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-transparent p-4 sm:p-5 flex flex-col justify-between",
        "transition-all duration-200 hover:-translate-y-0.5",
        SPAN_BY_INDEX[index],
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
            "font-black tracking-[var(--ls-tight)] leading-[1.05]",
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
}
