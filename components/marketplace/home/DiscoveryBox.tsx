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
import { ArrowUpRight } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

export default function DiscoveryBox({
  eyebrow,
  title,
  actionHref,
  ariaLabel,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  ariaLabel: string;
  /** Ícono chico que va en el chip del header (identidad visual de la caja). */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group/box flex h-full flex-col rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-300 hover:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.22)] sm:p-5">
      {/* Header: chip de ícono + eyebrow + título · pill "Ver todo" */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/15">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              {eyebrow}
            </p>
            <h2 className="truncate text-lg font-black leading-tight tracking-tight text-[var(--text-primary)] sm:text-xl">
              {title}
            </h2>
          </div>
        </div>
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          Ver todo
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>

      {/* Divisor sutil entre header y cards */}
      <div className="my-3.5 h-px bg-[var(--rule-soft)]" />

      {/* EXACTO 3 cards visibles (1/3 c/u, descontando los 2 gaps) + flechas
          ◂ ▸ que pasan de a 3 (scrollByFraction 1). */}
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
