"use client";

/**
 * DiscoveryBox — caja compacta para la fila de descubrimiento de la home
 * (Brandon 2026-06-12): "Recién llegados" y "Ranking semanal" van LADO A LADO,
 * cada una en su cuadro con header chico + ~3 cards que se deslizan (scroll
 * horizontal) dentro del mismo cuadro. En lg+ son 2 columnas; en mobile se
 * apilan (cada caja full-width). Reusada por HomeNewArrivals y MarketplaceTopToday.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

export default function DiscoveryBox({
  eyebrow,
  title,
  actionHref,
  ariaLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
            {eyebrow}
          </p>
          <h2 className="truncate text-base sm:text-lg font-black leading-tight tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--accent)] transition-all hover:gap-1.5"
        >
          Ver todo
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
      {/* Brandon 2026-06-12: EXACTAMENTE 3 cards visibles (1/3 c/u, descontando
          los 2 gaps), con flechas ◂ ▸ que pasan de a 3 (scrollByFraction 1) +
          buena separación. */}
      <HorizontalCarousel
        ariaLabel={ariaLabel}
        itemWidthClass="w-[calc((100%-1.5rem)/3)] shrink-0 snap-start"
        showNav
        scrollByFraction={1}
        edgeBleed={false}
      >
        {children}
      </HorizontalCarousel>
    </div>
  );
}
