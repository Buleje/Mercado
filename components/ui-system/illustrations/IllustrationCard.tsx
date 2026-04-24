"use client";

import { memo } from "react";
import { m } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE, DURATION } from "../motion";

/**
 * IllustrationCard — wrapper para presentar ilustraciones en empty states / hero cards.
 *
 * Incluye animacion de entrada sutil (respeta prefers-reduced-motion), espaciado
 * editorial, y slot para texto + CTA. Usar en lugar de `<div>` ad-hoc.
 *
 * @example
 * <IllustrationCard
 *   illustration={<CanastaVacia size={180} />}
 *   kicker="Favoritos"
 *   title="Guarda tus favoritos"
 *   description="Tocá el corazón en cualquier producto para verlos aquí cuando vuelvas."
 *   primaryAction={<Button>Ver marketplace</Button>}
 * />
 */

interface Props {
  illustration: React.ReactNode;
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** Color ilustracion — default text-tertiary */
  illustrationColor?: "primary" | "secondary" | "tertiary" | "accent";
  /** Padding vertical — default lg */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PADDING = {
  sm: "py-8 sm:py-10",
  md: "py-12 sm:py-14",
  lg: "py-16 sm:py-20",
};

const ILLUSTRATION_COLOR = {
  primary: "text-[var(--text-primary)]",
  secondary: "text-[var(--text-secondary)]",
  tertiary: "text-[var(--text-tertiary)]",
  accent: "text-[var(--brand-accent)]",
};

export const IllustrationCard = memo(function IllustrationCard({
  illustration,
  kicker,
  title,
  description,
  primaryAction,
  secondaryAction,
  illustrationColor = "tertiary",
  size = "lg",
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col items-center text-center", PADDING[size], className)}>
      <m.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.slow, ease: EASE.editorial }}
        className={cn("mb-6", ILLUSTRATION_COLOR[illustrationColor])}
      >
        {illustration}
      </m.div>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE.editorial, delay: 0.15 }}
      >
        {kicker && (
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
            {kicker}
          </p>
        )}
        <h3 className="text-xl sm:text-2xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] max-w-md mx-auto">
          {title}
        </h3>
        {description && (
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        )}
        {(primaryAction || secondaryAction) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {primaryAction}
            {secondaryAction}
          </div>
        )}
      </m.div>
    </div>
  );
});
