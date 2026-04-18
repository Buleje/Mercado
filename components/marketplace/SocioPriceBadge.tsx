"use client";

/**
 * SocioPriceBadge — Pequeño badge "Precio Socio" para ProductCard.
 *
 * Esquina superior del card. Minimalista: texto "Socio -X%" con tokens.
 */

import { Sparkles } from "@buleje/design-system/icons";

export interface SocioPriceBadgeProps {
  regularPrice: number;
  socioPrice: number;
  className?: string;
}

export function SocioPriceBadge({
  regularPrice,
  socioPrice,
  className,
}: SocioPriceBadgeProps) {
  if (socioPrice >= regularPrice) return null;
  const pct = Math.round(((regularPrice - socioPrice) / regularPrice) * 100);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] whitespace-nowrap ${className ?? ""}`}
      style={{
        backgroundColor: "color-mix(in oklch, var(--data-success) 15%, transparent)",
        color: "var(--data-success)",
      }}
      title={`Precio Socio Buleje: ${pct}% menos`}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Socio −{pct}%
    </span>
  );
}
