"use client";

/**
 * SocioFAQ — Accordion de 8 preguntas frecuentes.
 *
 * Usa `<details>` nativo para minimizar JS. Estilo DS tokens.
 */

import {
  SectionTitle,
  BodyText,
  CardTitle,
  Kicker,
} from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { MOCK_FAQS } from "@/lib/mocks/socio-buleje.mock";

export function SocioFAQ() {
  return (
    <section
      id="faq"
      className="mx-auto max-w-4xl px-4 py-16 sm:py-20"
      aria-labelledby="faq-heading"
    >
      <header className="text-center max-w-2xl mx-auto mb-10">
        <Kicker>Preguntas frecuentes</Kicker>
        <SectionTitle
          id="faq-heading"
          as="h2"
          className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
        >
          Todo lo que quieres saber
        </SectionTitle>
        <BodyText className="mt-3 text-[var(--text-secondary)]">
          Si no encontrás tu duda aquí, escríbenos por WhatsApp y te respondemos
          en minutos.
        </BodyText>
      </header>

      <ul className="space-y-2.5">
        {MOCK_FAQS.map((faq) => (
          <li key={faq.q}>
            <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 transition-all open:border-[var(--accent)]/30 open:shadow-sm hover:border-[var(--accent)]/40">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <CardTitle className="transition-colors group-hover:text-[var(--accent)]">{faq.q}</CardTitle>
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors group-open:bg-[var(--accent)] group-open:text-white">
                  <ChevronDown
                    className="h-4 w-4 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </span>
              </summary>
              <BodyText className="mt-3 text-[var(--text-secondary)] leading-relaxed">
                {faq.a}
              </BodyText>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
