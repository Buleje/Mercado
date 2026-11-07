"use client";

/**
 * SocioTestimonios — 3 cards de vecinos de Pucallpa (rediseño 2026-07-04).
 *
 * Avatar en accent, 5 estrellas, comilla editorial y chip de ahorro. Coherente
 * con el hero premium.
 */

import { SectionTitle, BodyText, Kicker } from "@buleje/design-system";
import { Star, Quote } from "@buleje/design-system/icons";
import { MOCK_TESTIMONIOS } from "@/lib/mocks/socio-buleje.mock";

export function SocioTestimonios() {
  return (
    <section
      className="border-y border-[var(--rule-muted)] bg-[var(--surface-sunken)]/60"
      aria-labelledby="testimonios-heading"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <Kicker>Testimonios</Kicker>
          <SectionTitle
            id="testimonios-heading"
            as="h2"
            className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
          >
            Vecinos de Pucallpa que ya son Socios
          </SectionTitle>
          <BodyText className="mt-3 text-[var(--text-secondary)]">
            Familias del barrio contando cuánto cambió su bodega diaria.
          </BodyText>
        </header>

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {MOCK_TESTIMONIOS.map((t) => (
            <li
              key={t.id}
              className="relative flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-sm)]"
            >
              <Quote
                className="absolute right-5 top-5 h-8 w-8 text-[var(--accent)]/15"
                aria-hidden
              />
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-sm font-black text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                  {t.initials}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-bold text-[var(--text-primary)]">{t.name}</h3>
                  <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{t.zone}</p>
                </div>
              </div>

              <div className="flex gap-0.5" aria-label="5 de 5 estrellas">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
                ))}
              </div>

              <blockquote className="flex-1">
                <BodyText className="leading-relaxed text-[var(--text-secondary)]">
                  &ldquo;{t.text}&rdquo;
                </BodyText>
              </blockquote>

              <div className="flex items-baseline justify-between border-t border-[var(--rule-muted)] pt-3">
                <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                  Ahorro mensual
                </span>
                <span className="rounded-full bg-[var(--data-success-500)]/12 px-2.5 py-0.5 text-[length:var(--ts-base)] font-black tabular-nums text-[var(--data-success-600,var(--data-success-500))]">
                  S/ {t.savings}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
