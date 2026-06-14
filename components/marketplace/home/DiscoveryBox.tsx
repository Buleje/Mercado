"use client";

/**
 * DiscoveryBox — caja de la fila de descubrimiento de la home (Brandon
 * 2026-06-12 · rediseño v2 2026-06-13). Dos cajas LADO A LADO (lg+), cada una
 * con header premium (chip de ícono + eyebrow + título + pill "Ver todo"),
 * divisor sutil y ~3 cards deslizables (flechas que pasan de a 3). Card con
 * esquinas grandes + sombra suave que se realza en hover. En mobile se apilan.
 * Reusada por HomeNewArrivals, MarketplaceTopToday y HomeCatalogStrip.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

export default function DiscoveryBox({
  eyebrow,
  title,
  actionHref,
  ariaLabel,
  icon,
  chipLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  ariaLabel: string;
  /** Ícono chico que va en el chip del header (identidad visual de la caja). */
  icon?: ReactNode;
  /** Texto del chip (CTA bajo el título). Default: eyebrow. */
  chipLabel?: string;
  children: ReactNode;
}) {
  return (
    // Brandon 2026-06-14 (estilo AliExpress "Combo Ahorro"): caja LIBRE — sin
    // bordes ni sombra, panel sutil, más compacta. Header centrado + pill-botón
    // tipo "3+ desde S/…" para elegir más opciones.
    <div className="flex h-full flex-col rounded-2xl bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="flex flex-col items-center text-center">
        <h2 className="text-base font-bold leading-tight tracking-tight text-[var(--text-primary)] sm:text-lg">
          {title}
        </h2>
        <Link
          href={actionHref}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          {icon && <span className="inline-flex shrink-0 text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          <span className="truncate">{chipLabel ?? eyebrow}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>

      {/* EXACTO 3 cards visibles (1/3 c/u, descontando los 2 gaps) + flechas
          ◂ ▸ que pasan de a 3 (scrollByFraction 1). */}
      <div className="mt-3">
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
    </div>
  );
}
