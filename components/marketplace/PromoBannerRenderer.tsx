"use client";

/**
 * PromoBannerRenderer — render unificado de banners promocionales.
 *
 * Garantiza que el preview en `/superadmin/banners` y la versión pública en
 * `/tiendas`, `/marketplace/explorar`, `/marketplace`, etc. se vean
 * EXACTAMENTE igual (sin variaciones de aspect, padding, tipografía).
 *
 * Soporta 3 tipos:
 *   - "classic": título + subtítulo + CTA chip → link
 *   - "image":   imagen pura (recomendada 1600×400) + CTA flotante mínima
 *   - "promo":   producto/combo embebido con precio + botón "Comprar" directo
 *
 * Reglas:
 *   - Aspect 4:1 fija (móvil colapsa a 5:2 si height <140px)
 *   - Tipografía display serif para títulos
 *   - Colores: si hay imagen → overlay oscuro + texto blanco; si no → texto dark sobre gradiente
 *   - El cliente compra/navega vía <Link>, sin JS extra
 */

import Link from "next/link";
import { ImageIcon, ChevronRight } from "@buleje/design-system/icons";

export type BannerType = "classic" | "image" | "promo";

export type PromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
};

export type PromoBanner = {
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
  type?: BannerType;
  promo?: PromoEmbed;
};

interface Props {
  banner: PromoBanner;
  /** Si true, el banner se envuelve en un <Link>. Default true. */
  asLink?: boolean;
  /** Clases extra para el contenedor exterior. */
  className?: string;
}

function fmtSoles(v: number): string {
  return `S/ ${v.toFixed(2)}`;
}

export default function PromoBannerRenderer({ banner, asLink = true, className = "" }: Props) {
  const type = banner.type ?? "classic";
  const linkHref = type === "promo" ? banner.promo?.buyHref || banner.ctaHref : banner.ctaHref;

  const inner = <BannerInner banner={banner} type={type} />;

  if (!asLink) return <div className={className}>{inner}</div>;
  return (
    <Link
      href={linkHref || "#"}
      className={`block ${className}`}
      aria-label={banner.title || banner.promo?.productName || "Banner promocional"}
    >
      {inner}
    </Link>
  );
}

function BannerInner({ banner, type }: { banner: PromoBanner; type: BannerType }) {
  const bgStyle = banner.imageUrl
    ? `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.35)), url(${banner.imageUrl}) center/cover`
    : `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})`;

  // ── PROMO: producto embebido + Comprar directo ────────────────────────────
  if (type === "promo" && banner.promo) {
    const p = banner.promo;
    return (
      <div
        className="relative overflow-hidden rounded-2xl aspect-[4/1] flex items-stretch px-4 sm:px-8 gap-4 sm:gap-6 border border-[var(--rule-soft)]"
        style={{ background: bgStyle }}
      >
        <div className="self-center aspect-square h-[80%] rounded-xl bg-white/95 shrink-0 overflow-hidden flex items-center justify-center shadow">
          {p.productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.productImage} alt={p.productName} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <ImageIcon className="h-1/3 w-1/3 text-[#0c1015]/30" strokeWidth={1.25} />
          )}
        </div>
        <div className="flex-1 min-w-0 self-center">
          {p.badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error)] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider mb-1">
              {p.badge}
            </span>
          )}
          {banner.title && (
            <h3
              className={
                "font-display text-base sm:text-xl lg:text-2xl font-extrabold tracking-tight truncate " +
                (banner.imageUrl ? "text-white drop-shadow" : "text-[#0c1015]")
              }
            >
              {banner.title}
            </h3>
          )}
          <p
            className={
              "text-xs sm:text-sm font-bold truncate mt-0.5 " +
              (banner.imageUrl ? "text-white/90 drop-shadow" : "text-[#0c1015]/80")
            }
          >
            {p.productName || "(sin producto)"}
          </p>
          {(p.price !== null || p.oldPrice !== null) && (
            <div className="flex items-baseline gap-2 mt-1">
              {p.price !== null && (
                <span
                  className={
                    "font-display text-lg sm:text-2xl font-extrabold tabular-nums " +
                    (banner.imageUrl ? "text-white drop-shadow" : "text-[#0c1015]")
                  }
                >
                  {fmtSoles(p.price)}
                </span>
              )}
              {p.oldPrice !== null && p.oldPrice > (p.price ?? 0) && (
                <span
                  className={
                    "text-xs sm:text-sm font-bold tabular-nums line-through " +
                    (banner.imageUrl ? "text-white/60" : "text-[#0c1015]/40")
                  }
                >
                  {fmtSoles(p.oldPrice)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="self-center shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success)] text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-extrabold whitespace-nowrap shadow-md">
            {p.buyLabel || "Comprar"}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    );
  }

  // ── IMAGE puro: imagen + CTA flotante opcional ────────────────────────────
  if (type === "image") {
    return (
      <div
        className="relative overflow-hidden rounded-2xl aspect-[4/1] flex items-center justify-center border border-[var(--rule-soft)]"
        style={{
          background: banner.imageUrl
            ? `url(${banner.imageUrl}) center/cover`
            : `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})`,
        }}
      >
        {!banner.imageUrl && (
          <span className="inline-flex items-center gap-1.5 text-[#0c1015]/50 text-xs font-bold">
            <ImageIcon className="h-4 w-4" /> Imagen pendiente
          </span>
        )}
        {banner.imageUrl && banner.ctaLabel && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/95 text-[#0c1015] px-3 py-1.5 text-xs font-extrabold whitespace-nowrap shadow">
            {banner.ctaLabel}
            <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    );
  }

  // ── CLASSIC (default): texto + CTA chip ───────────────────────────────────
  return (
    <div
      className="relative overflow-hidden rounded-2xl aspect-[4/1] flex items-center justify-between px-6 sm:px-10 border border-[var(--rule-soft)]"
      style={{ background: bgStyle }}
    >
      <div className="flex-1 min-w-0 max-w-[60%]">
        <h3
          className={
            "font-display text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight " +
            (banner.imageUrl ? "text-white drop-shadow-md" : "text-[#0c1015]")
          }
        >
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p
            className={
              "text-xs sm:text-sm lg:text-base font-medium mt-1 " +
              (banner.imageUrl ? "text-white/90 drop-shadow" : "text-[#0c1015]/70")
            }
          >
            {banner.subtitle}
          </p>
        )}
      </div>
      <span
        className={
          "shrink-0 inline-flex items-center gap-1 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold whitespace-nowrap " +
          (banner.imageUrl ? "bg-white text-[#0c1015]" : "bg-[#0c1015] text-white")
        }
      >
        {banner.ctaLabel}
        <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </span>
    </div>
  );
}
