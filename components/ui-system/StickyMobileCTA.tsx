"use client";

/**
 * StickyMobileCTA — Barra sticky inferior en mobile con CTA + precio.
 *
 * Pattern clasico de e-commerce: en PDP mobile el user baja a leer y el
 * CTA "Agregar al carrito" siempre visible abajo. Oculto en desktop.
 *
 * Auto-respeta safe-area-bottom (iOS home bar).
 *
 * Uso:
 *   <StickyMobileCTA
 *     price={29.90}
 *     originalPrice={39.90}
 *     ctaLabel="Agregar al carrito"
 *     onCta={handleAdd}
 *     extraAction={{ icon: <Heart />, label: "Favorito", onClick: toggleFav }}
 *   />
 */

import { ShoppingCart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  price: number;
  originalPrice?: number;
  /** Info text arriba del precio. Ej "S/ xxx por kg" */
  priceHint?: string;
  ctaLabel: string;
  onCta: () => void;
  /** Loading state del CTA */
  loading?: boolean;
  /** Disable CTA */
  disabled?: boolean;
  /** CTA secundario (ej. favorito, compartir) */
  extraAction?: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
  };
  /** Icon del CTA primario. Default ShoppingCart */
  ctaIcon?: React.ReactNode;
  /** Solo visible debajo de md breakpoint. Default true */
  mobileOnly?: boolean;
  /** Variant: "default" (blanco), "accent" (verde) */
  variant?: "default" | "accent";
  className?: string;
}

export default function StickyMobileCTA({
  price,
  originalPrice,
  priceHint,
  ctaLabel,
  onCta,
  loading = false,
  disabled = false,
  extraAction,
  ctaIcon = <ShoppingCart className="h-4 w-4" strokeWidth={2.5} aria-hidden />,
  mobileOnly = true,
  variant = "default",
  className,
}: Props) {
  const hasDiscount = originalPrice && originalPrice > price;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30",
        "border-t border-[var(--rule-base)] bg-[var(--surface-raised)]",
        mobileOnly && "md:hidden",
        "motion-safe:animate-[slideUp_0.3s_ease-out]",
        className,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      role="region"
      aria-label="Acciones del producto"
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Precio */}
        <div className="flex-1 min-w-0">
          {priceHint && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
              {priceHint}
            </p>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
              S/{Number(price).toFixed(2)}
            </span>
            {hasDiscount && (
              <span className="text-xs line-through text-[var(--text-tertiary)] tabular-nums">
                S/{Number(originalPrice).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Extra action (fav, share, etc) */}
        {extraAction && (
          <button
            type="button"
            onClick={extraAction.onClick}
            aria-label={extraAction.label}
            aria-pressed={extraAction.active}
            className={cn(
              "shrink-0 h-11 w-11 rounded-full border inline-flex items-center justify-center transition-colors",
              extraAction.active
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-primary)]",
            )}
          >
            {extraAction.icon}
          </button>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={onCta}
          disabled={loading || disabled}
          className={cn(
            "shrink-0 inline-flex items-center gap-2 rounded-full px-5 h-11 text-sm font-bold transition-all",
            "active:scale-95",
            variant === "accent"
              ? "bg-[var(--accent)] text-[var(--surface-canvas)] hover:opacity-90"
              : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]",
            (loading || disabled) && "opacity-60 cursor-not-allowed",
          )}
        >
          {ctaIcon}
          {loading ? "Agregando…" : ctaLabel}
        </button>
      </div>
    </div>
  );
}
