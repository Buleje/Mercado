"use client";

/**
 * OfertasHero — Hero editorial estilo Google/big-small para /marketplace/ofertas.
 *
 * Vocabulario unificado con landing / tiendas / marketplace / explorar:
 *   - Kicker con línea accent h-[3px] w-10
 *   - Título clamp fluido + italic serif accent en segunda línea
 *   - Grid asimétrico 7fr/5fr con stats a la derecha
 *   - Countdown en la card de stats (no como stat inline)
 */

import { Sparkles } from "@buleje/design-system/icons";
import { useDealsCountdown } from "./useDealsCountdown";
import type { DealsSummary } from "./types";

interface OfertasHeroProps {
  summary: DealsSummary;
}

export default function OfertasHero({ summary }: OfertasHeroProps) {
  const { days, hours, minutes, seconds } = useDealsCountdown(summary.flashEndsAt);

  return (
    <section
      aria-labelledby="ofertas-hero-heading"
      className="relative w-full overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-40 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-center">
          {/* ── LEFT — título dramático ────────────────────────────────── */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Ofertas de la semana
            </p>

            <h1
              id="ofertas-hero-heading"
              className="text-[clamp(2.75rem,8vw,5.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]"
            >
              Precios que
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                no te puedes perder.
              </span>
            </h1>

            <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
              Descuentos reales en bodegas cerca tuyo. Sin trampas ni letra
              chica — hoy ahorrás en lo que{" "}
              <span className="text-[var(--text-primary)] font-bold">
                más usás
              </span>
              .
            </p>
          </div>

          {/* ── RIGHT — stats vertical + countdown ────────────────────── */}
          <div>
            <div className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 sm:p-10">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-8">
                En números — Esta semana
              </p>
              <div className="space-y-8">
                {[
                  {
                    value: String(summary.totalProducts),
                    label: "Productos en oferta",
                  },
                  {
                    value: String(summary.totalStores),
                    label: "Bodegas con descuentos",
                  },
                  {
                    value: `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h`,
                    label: `Termina en · ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
                    live: true,
                  },
                ].map(({ value, label, live }, idx) => (
                  <div
                    key={label}
                    className={`flex items-baseline gap-5 ${idx > 0 ? "pt-6 border-t border-[var(--rule-soft)]" : ""}`}
                  >
                    <span
                      className="text-[clamp(2rem,4vw,3rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none w-[6.5ch] shrink-0"
                      aria-live={live ? "polite" : undefined}
                    >
                      {value}
                    </span>
                    <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
