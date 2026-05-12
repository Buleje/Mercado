"use client";

/**
 * MarketplacePriceRangesStrip — Filtros visuales por rango de precio.
 *
 * 4 cards grandes que dirigen al catálogo filtrado por max-price.
 * Útil para bargain hunters / clientes con presupuesto definido.
 */

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "@buleje/design-system/icons";

interface Range {
  href: string;
  big: string;
  label: string;
  description: string;
  examples: string[];
}

const RANGES: Range[] = [
  {
    href: "/marketplace?max=10",
    big: "S/ 10",
    label: "Menos de",
    description: "Esenciales del día",
    examples: ["Pan", "Leche", "Gaseosa"],
  },
  {
    href: "/marketplace?max=20",
    big: "S/ 20",
    label: "Menos de",
    description: "Para hacer la lista",
    examples: ["Arroz 5kg", "Aceite", "Detergente"],
  },
  {
    href: "/marketplace?max=50",
    big: "S/ 50",
    label: "Menos de",
    description: "La compra semanal",
    examples: ["Combos", "Carnes", "Bebidas"],
  },
  {
    href: "/marketplace?max=100",
    big: "S/ 100",
    label: "Hasta",
    description: "Despensa completa",
    examples: ["Packs", "Almacén", "Familia"],
  },
];

export default function MarketplacePriceRangesStrip() {
  return (
    <section>
      <header className="px-1 mb-4 sm:mb-5">
        <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
          Compra por presupuesto
        </p>
        <h2 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          ¿Cuánto querés gastar hoy?
        </h2>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {RANGES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group relative overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4 sm:p-5 transition-all hover:-translate-y-1 hover:shadow-lg hover:border-[var(--accent)]/40"
          >
            {/* Watermark big price */}
            <span
              className="pointer-events-none absolute -top-2 -right-2 font-display text-[80px] sm:text-[100px] font-extrabold leading-none text-[var(--accent)]/10 select-none transition-all group-hover:text-[var(--accent)]/20 group-hover:scale-110"
              aria-hidden
            >
              {r.big.replace("S/ ", "")}
            </span>

            <div className="relative">
              <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {r.label}
              </p>
              <p className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.035em] text-[var(--text-primary)] mt-1 leading-none">
                {r.big}
              </p>
              <p className="mt-2.5 text-sm sm:text-base font-extrabold text-[var(--text-secondary)]">
                {r.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.examples.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-tertiary)]"
                  >
                    {e}
                  </span>
                ))}
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)] transition-all group-hover:gap-1.5 group-hover:text-[var(--accent)]">
                Ver productos
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.75}
                  aria-hidden
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
