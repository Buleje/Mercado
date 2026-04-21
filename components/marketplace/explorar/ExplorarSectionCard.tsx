"use client";

/**
 * ExplorarSectionCard — wrapper que encapsula una sección de /explorar
 * en una caja con borde + título + (opcional) link "Ver más", estilo
 * Mercado Libre. Mantiene el contenido apretado adentro.
 *
 * Uso:
 *   <ExplorarSectionCard title="Ofertas del día" href="/marketplace/ofertas">
 *     <HorizontalCarousel>...</HorizontalCarousel>
 *   </ExplorarSectionCard>
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  kicker?: string;
  /** Link "Ver más" del header. Omitido si no se pasa. */
  href?: string;
  hrefLabel?: string;
  /** Padding interno del contenido. Default "p-4". */
  contentClassName?: string;
  className?: string;
  children: React.ReactNode;
  /** Si se pasa un Icon componente React, se muestra al lado del título. */
  rightSlot?: React.ReactNode;
}

export default function ExplorarSectionCard({
  title,
  kicker,
  href,
  hrefLabel = "Ver más",
  contentClassName,
  className,
  children,
  rightSlot,
}: Props) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        className,
      )}
    >
      {(title || kicker || href || rightSlot) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 sm:px-5 py-3">
          <div className="min-w-0 flex items-center gap-3">
            {kicker && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--accent)]">
                {kicker}
              </span>
            )}
            {title && (
              <h2 className="text-base sm:text-lg font-black tracking-[-0.015em] text-[var(--text-primary)] truncate">
                {title}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {rightSlot}
            {href && (
              <Link
                href={href}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full text-xs font-bold text-[var(--accent)] hover:underline"
              >
                {hrefLabel}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            )}
          </div>
        </header>
      )}
      <div className={cn("p-3 sm:p-4", contentClassName)}>{children}</div>
    </section>
  );
}
