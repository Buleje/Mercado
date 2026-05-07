"use client";

/**
 * StatsMarquee — fila de stats oversized inspirada en beastphilanthropy.org.
 * Números enormes (clamp 4-9rem), labels chicas debajo, cada bloque con
 * un acento de color de marca rotativo. Se anima con count-up al entrar
 * al viewport.
 */

import { Reveal } from "./Reveal";
import { AnimatedCounter } from "./AnimatedCounter";

interface Stat {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Tono visual del bloque (variaciones del teal de marca). */
  tone?: "primary" | "deep" | "light" | "ink";
}

interface Props {
  stats: Stat[];
  /** Título introductorio (kicker). */
  kicker?: string;
  /** Headline grande encima de los stats. */
  headline?: React.ReactNode;
  /** Subheadline opcional. */
  description?: string;
}

// Paleta unificada — todo dentro del branding teal de Buleje.
// 4 matices del mismo color (deep → primary → light) + un negro editorial.
const TONE_COLOR: Record<NonNullable<Stat["tone"]>, string> = {
  primary: "var(--brand-primary, var(--accent))",
  deep: "#00786f",
  light: "color-mix(in oklab, var(--accent) 70%, white)",
  ink: "var(--text-primary)",
};

export function StatsMarquee({ stats, kicker, headline, description }: Props) {
  return (
    <section
      aria-label="Buleje en números"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in oklab, var(--accent) 7%, transparent),transparent_60%)]"
      />
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {(kicker || headline || description) && (
          <Reveal>
            <div className="max-w-3xl mb-16 sm:mb-24">
              {kicker && (
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-6">
                  <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
                  {kicker}
                </p>
              )}
              {headline && (
                <h2 className="text-[clamp(2.25rem,6vw,4.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  {headline}
                </h2>
              )}
              {description && (
                <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl leading-[1.5]">
                  {description}
                </p>
              )}
            </div>
          </Reveal>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-12 sm:gap-y-16 gap-x-8 lg:gap-x-12">
          {stats.map((s, i) => {
            const color = TONE_COLOR[s.tone ?? "primary"];
            return (
              <Reveal key={i} delay={i * 100} offset={48}>
                <div className="group relative">
                  <div
                    aria-hidden
                    className="absolute -left-2 top-2 h-1 w-12 rounded-full transition-all group-hover:w-20"
                    style={{ backgroundColor: color, opacity: 0.85 }}
                  />
                  <div
                    className="text-[clamp(3.5rem,9vw,7rem)] font-black leading-[0.85] tracking-[-0.04em] tabular-nums"
                    style={{ color }}
                  >
                    <AnimatedCounter
                      value={s.value}
                      decimals={s.decimals ?? 0}
                      prefix={s.prefix ?? ""}
                      // Suprimir el suffix cuando value === 0 — "0+" o "0%"
                      // se siente fake / vacío. Mostrar "0" plano deja claro
                      // que arrancamos pero sin inflar la cifra.
                      suffix={s.value === 0 ? "" : (s.suffix ?? "")}
                      delay={i * 80}
                      duration={1600}
                    />
                  </div>
                  <p className="mt-3 text-base sm:text-lg font-bold uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                    {s.label}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
