"use client";

/**
 * SocioTestimonios — 3 cards con vecinos de Pucallpa satisfechos.
 *
 * Formato sobrio: avatar con iniciales + nombre + zona + quote + ahorro.
 */

import {
  SectionTitle,
  BodyText,
  CardTitle,
  Caption,
  Kicker,
  IconBadge,
} from "@buleje/design-system";
import { MOCK_TESTIMONIOS } from "@/lib/mocks/socio-buleje.mock";

export function SocioTestimonios() {
  return (
    <section
      className="border-y border-[var(--rule-muted)] bg-[var(--surface-sunken)]/60"
      aria-labelledby="testimonios-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <header className="text-center max-w-2xl mx-auto mb-12">
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

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MOCK_TESTIMONIOS.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <IconBadge size="lg" intent="muted" asDiv>
                  {t.initials}
                </IconBadge>
                <div className="min-w-0">
                  <CardTitle className="truncate">{t.name}</CardTitle>
                  <Caption className="text-[var(--text-tertiary)]">
                    {t.zone}
                  </Caption>
                </div>
              </div>
              <blockquote>
                <BodyText className="text-[var(--text-secondary)] leading-relaxed">
                  &ldquo;{t.text}&rdquo;
                </BodyText>
              </blockquote>
              <div className="pt-3 border-t border-[var(--rule-muted)] flex items-baseline justify-between">
                <Caption className="font-semibold text-[var(--text-secondary)]">
                  Ahorro mensual
                </Caption>
                <span className="text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--data-success-500)]">
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
