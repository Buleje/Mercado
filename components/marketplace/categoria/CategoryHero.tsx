"use client";

/**
 * CategoryHero — Hero editorial estilo Google/big-small.
 *
 * Vocabulario unificado con landing / tiendas / marketplace / explorar /
 * ofertas / en-vivo:
 *   - Kicker con línea accent h-[3px] w-10
 *   - Título clamp fluido + italic serif accent en segunda línea
 *   - Grid asimétrico 7fr/5fr con ilustración card + stats inline
 */

import type { CategoriaDef } from "@/lib/constants/marketplace-categories";
import {
  LimpiezaDomicilio,
  BodegaAbriendo,
  CarniceriaFresca,
  VerduraFresca,
  BebidasVarias,
  LacteosRefresh,
  CorazonLatiendo,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

const ILLUSTRATION_MAP = {
  LimpiezaDomicilio,
  BodegaAbriendo,
  CarniceriaFresca,
  VerduraFresca,
  BebidasVarias,
  LacteosRefresh,
  CorazonLatiendo,
  PaicheEnOlla,
} as const;

interface CategoryHeroProps {
  categoria: CategoriaDef;
  productCount: number;
  storeCount: number;
}

// Divide el label en palabras balanceadas para el salto de línea editorial.
// Ej: "Frutas y verduras" → ["Frutas", "y verduras"] o "Abarrotes" → ["Abarrotes", ""]
function splitLabelForHero(label: string): { line1: string; line2: string } {
  const words = label.trim().split(/\s+/);
  if (words.length === 1) return { line1: label, line2: "" };
  if (words.length === 2) return { line1: words[0], line2: words[1] };
  const mid = Math.ceil(words.length / 2);
  return {
    line1: words.slice(0, mid).join(" "),
    line2: words.slice(mid).join(" "),
  };
}

export default function CategoryHero({
  categoria,
  productCount,
  storeCount,
}: CategoryHeroProps) {
  const Illustration = ILLUSTRATION_MAP[categoria.illustration];
  const { line1, line2 } = splitLabelForHero(categoria.label);

  return (
    <section
      aria-labelledby="categoria-heading"
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-40 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-10 sm:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-10 lg:gap-16 items-center">
          {/* LEFT — título dramático */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              {categoria.kicker}
            </p>

            <h1
              id="categoria-heading"
              className="text-[clamp(2.75rem,8vw,5.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]"
            >
              {line1}
              {line2 && (
                <>
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    {line2}.
                  </span>
                </>
              )}
            </h1>

            <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
              {categoria.subtitle}
            </p>

            {/* Stats inline */}
            <div className="mt-8 grid grid-cols-2 gap-6 max-w-md">
              <div className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-black tabular-nums tracking-[-0.03em] text-[var(--text-primary)] leading-none">
                  {productCount}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  Producto{productCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-black tabular-nums tracking-[-0.03em] text-[var(--text-primary)] leading-none">
                  {storeCount}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  Tienda{storeCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT — ilustración card */}
          <div className="hidden lg:flex">
            <div className="relative w-full aspect-[4/3] rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden flex items-center justify-center">
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.06] via-transparent to-[var(--accent)]/[0.03]"
              />
              <Illustration
                size={240}
                strokeWidth={1.5}
                className="relative text-[var(--text-primary)]/70"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
