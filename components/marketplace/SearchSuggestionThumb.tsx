"use client";

/**
 * SearchSuggestionThumb — thumbnail de una fila del autocomplete.
 *
 * Muestra la IMAGEN real (logo de tienda / foto de producto) con object-cover.
 * Si no hay imagen, el tipo no la tiene (categoría/query), o la URL falla al
 * cargar (404 / dominio externo arbitrario), cae a un ícono Lucide dentro de
 * una caja de color semántico.
 *
 * Usa <img> nativo (no next/image) A PROPÓSITO: las fotos de producto vienen
 * de dominios externos arbitrarios que el bodeguero pega (plazavea, etc.) y no
 * están en `remotePatterns` de next.config — next/image las rompería. A 44px
 * la optimización no aporta, y `onError` nos da fallback resiliente.
 *
 * Compartido por el dropdown desktop (NavbarSearchAutocomplete) y el overlay
 * mobile (MobileSearchOverlay) para que ambos se vean idénticos.
 */

import { useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type ThumbVariant = "store" | "product" | "category" | "query" | "recent";

const BOX_BY_VARIANT: Record<ThumbVariant, string> = {
  store: "bg-blue-500/10 text-blue-500",
  product: "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-600)]",
  category: "bg-[var(--accent-soft)] text-[var(--accent)]",
  query: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  recent: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

interface Props {
  variant: ThumbVariant;
  image?: string | null;
  Icon: LucideIcon;
  /** Lado del thumbnail en px. Default 44. */
  size?: number;
}

export default function SearchSuggestionThumb({ variant, image, Icon, size = 44 }: Props) {
  const [errored, setErrored] = useState(false);
  const canShowImg = (variant === "store" || variant === "product") && !!image && !errored;
  // Tienda = más redondeado (logo), producto = cuadrado suave (foto).
  const radius = variant === "store" ? "rounded-xl" : "rounded-lg";
  const dim = { width: size, height: size };

  if (canShowImg) {
    return (
      <span
        className={cn(
          "relative shrink-0 overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
          radius,
        )}
        style={dim}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails de URLs externas arbitrarias, ver doc del componente */}
        <img
          src={image as string}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        radius,
        BOX_BY_VARIANT[variant],
      )}
      style={dim}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}
