/**
 * StoreCardCanonical — card canonical de tienda para marketplace (ADR-075).
 *
 * Framework-agnostic: usa `<a>` (no Next Link) e `<img>` nativo por default.
 * Para optimizacion de imagen Next.js, pasar `renderImage` prop con
 * `<Image fill ... />` igual que ProductCardCompact.
 *
 * Dos variantes:
 *   - `default` — card completa para grids (explorar, buscar).
 *   - `compact` — reducida para RecommendationsStrip carousel.
 *
 * Slots abiertos:
 *   - `badges` — arriba del nombre (ProductBadge, tags propios, etc).
 *   - `footer` — debajo del nombre (rating, distancia, horario, etc).
 *
 * Reglas visuales (Holded minimalista):
 *   - Sin sombras. Hover: border-strong + transition-colors.
 *   - rounded-lg. 1-2 colores. Sin emojis.
 *   - Imagen: aspect-[4/3] con object-cover. Sin imagen: StoreImagePlaceholder.
 *
 * @example
 *   <StoreCardCanonical
 *     storeId="abc123"
 *     name="Bodega El Sol"
 *     slug="bodega-el-sol"
 *     imageUrl={store.logo}
 *     footer={<span>4.8 estrellas</span>}
 *   />
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "./utils";
import { StoreImagePlaceholder } from "./store-image-placeholder";
import { STORE_CARD_RATIO } from "./tokens";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StoreCardCanonicalProps {
  /** ID unico de la tienda — alimenta el placeholder deterministico. */
  storeId: string;
  /** Nombre de la tienda. */
  name: string;
  /** Slug para construir el href por default. */
  slug: string;
  /** URL de la imagen principal. Si null/undefined se muestra StoreImagePlaceholder. */
  imageUrl?: string | null;
  /**
   * Slot de badges (arriba del nombre).
   * Ej: <ProductBadge intent="popular">Abierto</ProductBadge>
   */
  badges?: ReactNode;
  /**
   * Slot de footer (debajo del nombre).
   * Ej: rating, distancia, horario, numero de resenas.
   */
  footer?: ReactNode;
  /**
   * Variante visual.
   * - `default` — card completa, padding normal, texto base.
   * - `compact` — padding reducido, texto mas pequeno. Ideal para carouseles.
   */
  variant?: "default" | "compact";
  /**
   * Override del href. Default: `/marketplace/${slug}`.
   */
  href?: string;
  /**
   * Override del render de la imagen — igual que ProductImage.renderImage.
   * Pasar `<Image fill ... />` de Next.js para optimizacion completa.
   *
   * @example
   *   renderImage={({ src, alt, className }) => (
   *     <Image src={src} alt={alt} fill className={className} sizes="(max-width:640px) 100vw, 400px" />
   *   )}
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  /**
   * Slot opcional usado cuando `imageUrl` es null/undefined.
   * Reemplaza el StoreImagePlaceholder por el contenido custom — útil
   * para mostrar un mini-banner de marca, color por categoría, etc.
   * El consumidor recibe un wrapper con aspect-ratio fijo del card.
   */
  renderImageFallback?: () => ReactNode;
  /**
   * Avatar/logo opcional renderizado encima del banner, semi-overlap
   * con el área de contenido. Estilo Rappi/PedidosYa: provee identidad
   * fuerte de la tienda incluso con banner genérico.
   */
  avatar?: ReactNode;
  /**
   * Override de clases del contenedor que envuelve el cover/imagen.
   * Útil para cambiar el aspect-ratio responsivo (ej. `aspect-[16/9] sm:aspect-[4/3]`).
   * Las clases pasadas se mergean con `cn()` (tailwind-merge) → ganan sobre el default.
   */
  imageWrapperClassName?: string;
  /**
   * Overlays absolutos sobre el cover (ej: rating chip top-left,
   * promo badge debajo). Estilo Rappi/Uber Eats — el rating queda en
   * el cover y el body se libera para nombre + meta.
   * Se renderiza con `absolute top-3 left-3` y z-10 — el consumer
   * puede pasar un Fragment con varios elementos stack-vertical.
   */
  coverOverlay?: ReactNode;
  /**
   * Slot opcional para el logo del negocio en la esquina inferior izquierda
   * del cover. Estilo Rappi/PedidosYa — un avatar redondo que identifica
   * la marca sin invadir el body. El consumer es responsable del tamaño y
   * borde (típicamente h-9 w-9 mobile, h-11 w-11 desktop, border-white).
   */
  coverBottomLeft?: ReactNode;
  /** Override de clases del contenedor raiz. */
  className?: string;
  /**
   * Override del render del link raíz. El DS es framework-agnostic y usa
   * `<a>` nativo (full page reload). Para SPA navigation + prefetch, los
   * consumers Next deben pasar `<Link>`:
   *
   *   renderLink={({ href, className, children, ariaLabel }) => (
   *     <Link href={href} className={className} aria-label={ariaLabel}>
   *       {children}
   *     </Link>
   *   )}
   *
   * Brandon 2026-05-21 perf v4: sin este slot, cada click a una tienda
   * disparaba un GET completo al servidor — TTFB 0.3s+ visible. Con Next
   * Link + prefetch, la navegación es ~50ms (chunks pre-warm en hover).
   */
  renderLink?: (args: {
    href: string;
    className: string;
    ariaLabel: string;
    children: ReactNode;
  }) => ReactNode;
}

// ── Estilos por variante ──────────────────────────────────────────────────────

const CARD_PADDING: Record<NonNullable<StoreCardCanonicalProps["variant"]>, string> = {
  default: "p-3",
  compact: "p-2",
};

const NAME_SIZE: Record<NonNullable<StoreCardCanonicalProps["variant"]>, string> = {
  default: "text-[length:var(--ts-lg)] font-black tracking-tight",
  compact: "text-[length:var(--ts-base)] font-bold tracking-tight",
};

// ── Componente ────────────────────────────────────────────────────────────────

/**
 * StoreCardCanonical — unica fuente de verdad para cards de tienda en el marketplace.
 *
 * - Reemplaza StoreCard interno de MarketplaceStoresView (Fase 2).
 * - NO crea nuevas sombras ni colores — usa solo CSS custom properties del DS.
 */
export function StoreCardCanonical({
  storeId,
  name,
  slug,
  imageUrl,
  badges,
  footer,
  variant = "default",
  href,
  renderImage,
  renderImageFallback,
  avatar,
  imageWrapperClassName,
  coverOverlay,
  coverBottomLeft,
  className,
  renderLink,
}: StoreCardCanonicalProps) {
  const resolvedHref = href ?? `/marketplace/${slug}`;
  const padding = CARD_PADDING[variant];
  const nameSize = NAME_SIZE[variant];

  const imgClass =
    "absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--dur-base)] group-hover:scale-[1.02]";

  const rootClassName = cn(
    "group block overflow-hidden rounded-lg border border-[var(--rule-base)]",
    "bg-[var(--surface-raised)]",
    "transition-colors duration-[var(--dur-fast)]",
    "hover:border-[var(--rule-strong)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
    className,
  );

  const ariaLabel = `Ir a la tienda ${name}`;

  // Body interno de la card — comparte estructura entre <a> y renderLink.
  const cardBody = (
    <>
      {/* Imagen / placeholder ──────────────────────────────────────────────── */}
      {imageUrl ? (
        <div
          className={cn(
            "relative w-full overflow-hidden",
            `aspect-[${STORE_CARD_RATIO}]`,
            "bg-[var(--surface-sunken)]",
            imageWrapperClassName,
          )}
        >
          {renderImage ? (
            renderImage({ src: imageUrl, alt: `Logo de ${name}`, className: imgClass })
          ) : (
            /* DS es framework-agnostic: usa <img> nativo. Next consumers deben pasar renderImage. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Logo de ${name}`}
              loading="lazy"
              className={imgClass}
            />
          )}
          {/* Cover overlay opcional (rating, promo) — absoluto top-left */}
          {coverOverlay != null && (
            <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1 items-start">
              {coverOverlay}
            </div>
          )}
          {/* Logo del negocio bottom-left (estilo Rappi/PedidosYa) */}
          {coverBottomLeft != null && (
            <div className="absolute bottom-2.5 left-2.5 z-10">
              {coverBottomLeft}
            </div>
          )}
        </div>
      ) : renderImageFallback ? (
        <div
          className={cn(
            "relative w-full overflow-hidden",
            `aspect-[${STORE_CARD_RATIO}]`,
            "bg-[var(--surface-sunken)]",
            imageWrapperClassName,
          )}
        >
          {renderImageFallback()}
          {coverOverlay != null && (
            <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1 items-start">
              {coverOverlay}
            </div>
          )}
          {coverBottomLeft != null && (
            <div className="absolute bottom-2.5 left-2.5 z-10">
              {coverBottomLeft}
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <StoreImagePlaceholder
            storeId={storeId}
            name={name}
            className="rounded-t-lg rounded-b-none"
          />
          {coverOverlay != null && (
            <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1 items-start">
              {coverOverlay}
            </div>
          )}
          {coverBottomLeft != null && (
            <div className="absolute bottom-2.5 left-2.5 z-10">
              {coverBottomLeft}
            </div>
          )}
        </div>
      )}

      {/* Avatar overlay — semi-overlap entre banner y body, estilo Rappi */}
      {avatar != null && (
        <div className="relative">
          <div className="absolute -top-5 left-3 z-10">{avatar}</div>
        </div>
      )}

      {/* Info ──────────────────────────────────────────────────────────────── */}
      <div className={cn("flex flex-col gap-1", padding, avatar != null && "pt-7")}>
        {/* Slot badges — encima del nombre */}
        {badges != null && (
          <div className="flex flex-wrap gap-1">{badges}</div>
        )}

        {/* Nombre */}
        <p
          className={cn(
            "line-clamp-2 leading-[var(--lh-snug)] text-[var(--text-primary)]",
            nameSize,
          )}
        >
          {name}
        </p>

        {/* Slot footer — debajo del nombre */}
        {footer != null && (
          <div className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            {footer}
          </div>
        )}
      </div>
    </>
  );

  if (renderLink) {
    return renderLink({
      href: resolvedHref,
      className: rootClassName,
      ariaLabel,
      children: cardBody,
    });
  }

  return (
    <a href={resolvedHref} className={rootClassName} aria-label={ariaLabel}>
      {cardBody}
    </a>
  );
}
