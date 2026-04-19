/**
 * ProductImage — wrapper interno reusable por las 3 cards.
 *
 * El DS es framework-agnostic: no importa `next/image` directamente para
 * mantener el package portable. En su lugar:
 *
 *   1. Default → `<img>` nativo con `loading="lazy"` (o `eager` para hero).
 *   2. Override → consumer pasa `renderImage` prop con `<Image />` de Next.
 *
 * Asi las apps Next obtienen optimizacion completa y las apps non-Next
 * funcionan con el fallback sin dependencias extra.
 */
"use client";

import type { ReactNode } from "react";
import { Package } from "../icons";
import { cn } from "../utils";

export interface ProductImageProps {
  src: string | null;
  alt: string;
  /** Relacion de aspecto. Tailwind class. Ej: "aspect-square", "aspect-[4/5]". */
  aspect?: string;
  /** Override del fallback icon. Default: Package. */
  placeholderIcon?: ReactNode;
  /**
   * Slot opcional para render custom de la imagen (ej: Next.js Image).
   * Recibe src + alt + className ya resueltos. Si se pasa, tiene precedencia.
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  /** Lazy por default. `false` para hero/above-the-fold. */
  priority?: boolean;
  /** Escalar en hover del grupo contenedor. */
  hoverZoom?: boolean;
  /** Opcional: border-radius override. Default inherits from parent. */
  rounded?: string;
  className?: string;
}

const IMG_CLASS =
  "absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--dur-base)]";

export function ProductImage({
  src,
  alt,
  aspect = "aspect-square",
  placeholderIcon,
  renderImage,
  priority,
  hoverZoom,
  rounded,
  className,
}: ProductImageProps) {
  const zoomClass = hoverZoom ? "group-hover:scale-105" : "";
  const imgClass = cn(IMG_CLASS, zoomClass);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--surface-sunken)]",
        aspect,
        rounded,
        className,
      )}
    >
      {src ? (
        renderImage ? (
          renderImage({ src, alt, className: imgClass })
        ) : (
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            className={imgClass}
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {placeholderIcon ?? (
            <Package
              className="h-10 w-10 text-[var(--text-tertiary)]"
              aria-hidden
            />
          )}
        </div>
      )}
    </div>
  );
}
