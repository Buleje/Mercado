/**
 * ExplorarSectionHeader — header editorial reusable para secciones de /explorar.
 *
 * Patron: kicker uppercase + h2 black + dotline accent + CTA opcional.
 * Identidad Buleje minimalista (sin emojis, sin colores hardcoded).
 *
 * Uso:
 * ```tsx
 * <ExplorarSectionHeader
 *   kicker="Para vos"
 *   title="Comprá de nuevo"
 *   subtitle="Lo que ya pediste antes, listo en un toque"
 *   ctaLabel="Ver historial"
 *   ctaHref="/marketplace/mi-cuenta/pedidos"
 * />
 * ```
 */

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";

interface Props {
  kicker?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export default function ExplorarSectionHeader({
  kicker,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: Props) {
  return (
    <header className="flex items-end justify-between gap-4 mb-7 pb-5 border-b border-[var(--rule-soft)]">
      <div className="min-w-0 flex-1">
        {kicker && (
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-3">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-8 rounded-full bg-[var(--accent)]"
            />
            {kicker}
          </p>
        )}
        <h2 className="text-[clamp(1.625rem,3.2vw,2.5rem)] font-black tracking-[-0.025em] text-[var(--text-primary)] leading-[1.05]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-base sm:text-[17px] text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:gap-2.5 transition-all whitespace-nowrap shrink-0"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      )}
    </header>
  );
}
