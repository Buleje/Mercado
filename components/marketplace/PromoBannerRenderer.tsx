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

import Image from "next/image";
import Link from "next/link";
import { ImageIcon, ChevronRight } from "@buleje/design-system/icons";

export type BannerType = "classic" | "image" | "promo";

export type ImageAdjust = {
  position: { x: number; y: number };
  scale: number;
  fit: "cover" | "contain";
};

export type PromoItemSource = "manual" | "linked";

export type Anchor = { x: number; y: number };

export type PromoItem = {
  id: string;
  source: PromoItemSource;
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
  linkedStoreSlug?: string | null;
  linkedProductId?: string | number | null;
  imageAdjust?: ImageAdjust;
  buyAnchor?: Anchor | null;
  badgeAnchor?: Anchor | null;
  productAnchor?: Anchor | null;
  productSize?: number;
  buySize?: number;
};

export type PromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
  imageAdjust?: ImageAdjust;
  items?: PromoItem[];
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
  /** banners v2 F2: ventana de programación (ISO). Vacío = sin límite. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** banners v2 F4: zonas donde se muestra. Vacío = todas. */
  targetZones?: string[];
  type?: BannerType;
  promo?: PromoEmbed;
  imageAdjust?: ImageAdjust;
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

function clampSize(v: number): number {
  return Math.max(10, Math.min(60, v));
}

function clampBuySize(v: number): number {
  return Math.max(8, Math.min(50, v));
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

/** Props de imagen calculados desde imageAdjust para usar con next/image. */
function adjustedImageProps(banner: PromoBanner): {
  objectPosition: string;
  objectFit: "cover" | "contain";
  style?: React.CSSProperties;
} {
  const adj = banner.imageAdjust;
  const x = adj?.position?.x ?? 50;
  const y = adj?.position?.y ?? 50;
  const fit = adj?.fit ?? "cover";
  return {
    objectPosition: `${x}% ${y}%`,
    objectFit: fit,
    style: fit === "contain" ? { backgroundColor: banner.bgFrom } : undefined,
  };
}

function BannerInner({ banner, type }: { banner: PromoBanner; type: BannerType }) {
  const hasImage = !!banner.imageUrl;
  const bgGradient = `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})`;

  // ── PROMO: producto embebido + Comprar directo ────────────────────────────
  if (type === "promo" && banner.promo) {
    const p = banner.promo;
    const items: PromoItem[] = (p.items && p.items.length > 0)
      ? p.items
      : [legacyToItem(p)];

    return (
      <div
        className="relative overflow-hidden rounded-2xl aspect-[16/9] sm:aspect-[4/1] flex items-stretch px-4 sm:px-6 gap-3 sm:gap-4 border border-[var(--rule-soft)]"
        style={{ background: bgGradient }}
      >
        {hasImage && banner.imageUrl && (
          <>
            <Image
              src={banner.imageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="pointer-events-none select-none"
              style={{ objectFit: adjustedImageProps(banner).objectFit, objectPosition: adjustedImageProps(banner).objectPosition }}
            />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none z-[1]"
              style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.35))" }}
            />
          </>
        )}
        <div className="relative z-10 flex items-stretch w-full gap-3 sm:gap-4 overflow-x-auto scrollbar-thin">
          {items.length === 1 ? (
            <PromoItemCard item={items[0]!} bannerTitle={banner.title} hasBgImage={hasImage} layout="hero" />
          ) : (
            items.map((it) => (
              <PromoItemCard key={it.id} item={it} bannerTitle={banner.title} hasBgImage={hasImage} layout="grid" />
            ))
          )}
        </div>
      </div>
    );
  }

  // ── IMAGE puro: imagen + CTA flotante opcional ────────────────────────────
  if (type === "image") {
    return (
      <div
        className="relative overflow-hidden rounded-2xl aspect-[16/9] sm:aspect-[4/1] flex items-center justify-center border border-[var(--rule-soft)]"
        style={{ background: bgGradient }}
      >
        {hasImage && banner.imageUrl && (
          <Image
            src={banner.imageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="pointer-events-none select-none"
            style={{ objectFit: adjustedImageProps(banner).objectFit, objectPosition: adjustedImageProps(banner).objectPosition }}
          />
        )}
        {!banner.imageUrl && (
          <span className="inline-flex items-center gap-1.5 text-[#0c1015]/50 text-xs font-bold">
            <ImageIcon className="h-4 w-4" /> Sin imagen — subila desde el editor
          </span>
        )}
        {banner.imageUrl && banner.ctaLabel && (
          <span className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/95 text-[#0c1015] px-3 py-1.5 text-xs font-extrabold whitespace-nowrap shadow">
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
      className="relative overflow-hidden rounded-2xl aspect-[16/9] sm:aspect-[4/1] flex items-center justify-between px-6 sm:px-10 border border-[var(--rule-soft)]"
      style={{ background: bgGradient }}
    >
      {hasImage && banner.imageUrl && (
        <>
          <Image
            src={banner.imageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="pointer-events-none select-none"
            style={{ objectFit: adjustedImageProps(banner).objectFit, objectPosition: adjustedImageProps(banner).objectPosition }}
          />
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none z-[1]"
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.35))" }}
          />
        </>
      )}
      <div className="relative z-10 flex items-center justify-between gap-3 w-full">
      <div className="flex-1 min-w-0 max-w-[60%] sm:max-w-[60%]">
        <h3
          className={
            "font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-[1.1] " +
            (banner.imageUrl ? "text-white drop-shadow-md" : "text-[#0c1015]")
          }
        >
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p
            className={
              "text-sm sm:text-sm lg:text-base font-medium mt-1.5 leading-snug line-clamp-2 sm:line-clamp-none " +
              (banner.imageUrl ? "text-white/90 drop-shadow" : "text-[#0c1015]/70")
            }
          >
            {banner.subtitle}
          </p>
        )}
      </div>
      <span
        className={
          "shrink-0 inline-flex items-center gap-1 rounded-full px-3.5 sm:px-4 h-9 sm:h-10 text-sm font-extrabold whitespace-nowrap shadow-md " +
          (banner.imageUrl ? "bg-white text-[#0c1015]" : "bg-[#0c1015] text-white")
        }
      >
        {banner.ctaLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-item promo helpers
// ─────────────────────────────────────────────────────────────────────────────

function legacyToItem(p: PromoEmbed): PromoItem {
  return {
    id: "legacy",
    source: "manual",
    productName: p.productName,
    productImage: p.productImage,
    price: p.price,
    oldPrice: p.oldPrice,
    badge: p.badge,
    buyHref: p.buyHref,
    buyLabel: p.buyLabel,
    imageAdjust: p.imageAdjust,
  };
}

function itemImageStyle(item: PromoItem): React.CSSProperties {
  const adj = item.imageAdjust;
  const x = adj?.position?.x ?? 50;
  const y = adj?.position?.y ?? 50;
  const scale = adj?.scale ?? 100;
  const fit = adj?.fit ?? "cover";
  return {
    backgroundImage: item.productImage ? `url(${item.productImage})` : undefined,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: fit === "contain" ? `${scale}% auto` : `${scale}% ${scale}%`,
  };
}

/** Tarjeta de un item dentro del banner. Layout "hero" = un solo item con
 *  texto al lado; "grid" = múltiples items lado-a-lado, más compactos. */
function PromoItemCard({
  item,
  bannerTitle,
  hasBgImage,
  layout,
}: {
  item: PromoItem;
  bannerTitle: string;
  hasBgImage: boolean;
  layout: "hero" | "grid";
}) {
  const textOnImage = hasBgImage;

  if (layout === "hero") {
    const badge = item.badge ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-500)] text-white px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
        {item.badge}
      </span>
    ) : null;
    const buyChip = (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)] text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-extrabold whitespace-nowrap shadow-md">
        {item.buyLabel || "Comprar"}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    );
    const productSize = clampSize(item.productSize ?? 28);
    const productCard = (
      <div className="rounded-xl bg-white/95 overflow-hidden flex items-center justify-center shadow h-full w-full">
        {item.productImage ? (
          <div aria-label={item.productName} role="img" className="h-full w-full" style={itemImageStyle(item)} />
        ) : (
          <ImageIcon className="h-1/3 w-1/3 text-[#0c1015]/30" strokeWidth={1.25} />
        )}
      </div>
    );
    return (
      <>
        {/* Slot flex — sólo si no hay productAnchor (modo libre) */}
        {!item.productAnchor && (
          <div className="self-center aspect-square h-[80%] shrink-0">
            {productCard}
          </div>
        )}
        <div className="flex-1 min-w-0 self-center">
          {/* Badge: sólo inline si no tiene anchor libre (sino se renderiza absolute abajo) */}
          {badge && !item.badgeAnchor && <div className="mb-1">{badge}</div>}
          {bannerTitle && (
            <h3 className={"font-display text-base sm:text-xl lg:text-2xl font-extrabold tracking-tight truncate " + (textOnImage ? "text-white drop-shadow" : "text-[#0c1015]")}>
              {bannerTitle}
            </h3>
          )}
          {item.productName && (
            <p className={"text-xs sm:text-sm font-bold truncate mt-0.5 " + (textOnImage ? "text-white/90 drop-shadow" : "text-[#0c1015]/80")}>
              {item.productName}
            </p>
          )}
          {(item.price !== null || item.oldPrice !== null) && (
            <div className="flex items-baseline gap-2 mt-1">
              {item.price !== null && (
                <span className={"font-display text-lg sm:text-2xl font-extrabold tabular-nums " + (textOnImage ? "text-white drop-shadow" : "text-[#0c1015]")}>
                  {fmtSoles(item.price)}
                </span>
              )}
              {item.oldPrice !== null && item.oldPrice > (item.price ?? 0) && (
                <span className={"text-xs sm:text-sm font-bold tabular-nums line-through " + (textOnImage ? "text-white/60" : "text-[#0c1015]/40")}>
                  {fmtSoles(item.oldPrice)}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Buy chip — flex slot solo si no tiene anchor libre */}
        {!item.buyAnchor && (
          <div className="self-center shrink-0">{buyChip}</div>
        )}

        {/* Producto con anchor libre — render absoluto, square con tamaño relativo al ancho del banner */}
        {item.productAnchor && (
          <div
            className="absolute z-10"
            style={{
              left: `${item.productAnchor.x}%`,
              top: `${item.productAnchor.y}%`,
              width: `${productSize}%`,
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
            }}
          >
            {productCard}
          </div>
        )}
        {/* Overlays absolutos cuando hay anchor */}
        {item.badgeAnchor && badge && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${item.badgeAnchor.x}%`,
              top: `${item.badgeAnchor.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {badge}
          </div>
        )}
        {item.buyAnchor && (
          <div
            className="absolute z-20"
            style={{
              left: `${item.buyAnchor.x}%`,
              top: `${item.buyAnchor.y}%`,
              transform: `translate(-50%, -50%) scale(${clampBuySize(item.buySize ?? 22) / 22})`,
              transformOrigin: "center center",
            }}
          >
            {buyChip}
          </div>
        )}
      </>
    );
  }

  // Grid layout — tarjeta compacta auto-contenida (imagen + nombre + precio + comprar)
  return (
    <div className="self-center flex items-center gap-2 sm:gap-3 rounded-xl bg-white/95 px-2 sm:px-3 py-2 shadow-sm shrink-0 min-w-[180px] sm:min-w-[220px] max-w-[280px]">
      <div className="aspect-square h-14 sm:h-16 rounded-lg bg-[#0c1015]/5 shrink-0 overflow-hidden flex items-center justify-center">
        {item.productImage ? (
          <div aria-label={item.productName} role="img" className="h-full w-full" style={itemImageStyle(item)} />
        ) : (
          <ImageIcon className="h-1/2 w-1/2 text-[#0c1015]/25" strokeWidth={1.25} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {item.badge && (
          <span className="inline-flex items-center rounded-full bg-[var(--data-error-500)] text-white px-1.5 py-px text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider mb-0.5">
            {item.badge}
          </span>
        )}
        {item.productName && (
          <p className="text-xs font-extrabold text-[#0c1015] truncate leading-tight">
            {item.productName}
          </p>
        )}
        <div className="flex items-baseline gap-1.5 mt-0.5">
          {item.price !== null && (
            <span className="font-display text-sm font-extrabold text-[#0c1015] tabular-nums leading-tight">
              {fmtSoles(item.price)}
            </span>
          )}
          {item.oldPrice !== null && item.oldPrice > (item.price ?? 0) && (
            <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums line-through text-[#0c1015]/40 leading-tight">
              {fmtSoles(item.oldPrice)}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-0.5 mt-1 rounded-full bg-[var(--data-success-500)] text-white px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold">
          {item.buyLabel || "Comprar"}
          <ChevronRight className="h-2.5 w-2.5" />
        </span>
      </div>
    </div>
  );
}
