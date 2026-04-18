"use client";

/**
 * TestimoniosEditorial — 3 testimonios Amazon-style con avatar placeholder,
 * nombre peruano real, role y texto.
 *
 * Copy en lenguaje del barrio (no marketing plano).
 */

import {
  CardTitle,
  BodyText,
  SectionTitle,
  IconBadge,
} from "@buleje/design-system";

type Testimonio = {
  slug: string;
  initials: string;
  name: string;
  role: string;
  quote: string;
  feature: string;
};

const TESTIMONIOS: Testimonio[] = [
  {
    slug: "maria",
    initials: "MA",
    name: "María Arévalo",
    role: "Mamá de 3, Yarinacocha",
    quote:
      "Desde que soy Socio Buleje pagué la suscripción en dos semanas con el cashback. Y el delivery gratis es lo mejor — no manejo auto.",
    feature: "Socio Buleje",
  },
  {
    slug: "juan",
    initials: "JC",
    name: "Juan Carlos Panduro",
    role: "Vecino del sector, Callería",
    quote:
      "El asistente me ahorra llamar a la bodega. Le pregunto si hay paiche fresco, me contesta en segundos y paso el pedido directo.",
    feature: "Asistente IA",
  },
  {
    slug: "carmen",
    initials: "CR",
    name: "Carmen Ruiz",
    role: "Docente jubilada, Pucallpa",
    quote:
      "Las gift cards son perfectas para mi mamá que vive en Lima. Le llega por WhatsApp y ella elige en la bodega que quiere. Sin complicación.",
    feature: "Gift Cards",
  },
];

export function TestimoniosEditorial() {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl space-y-3 mb-10 sm:mb-14">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Lo que dicen los vecinos
          </span>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold">
            Historias reales de Pucallpa
          </SectionTitle>
          <BodyText className="text-[length:var(--ts-base)] text-[var(--text-secondary)] leading-relaxed">
            Tres vecinos que ya usan Buleje todos los días. Sin filtro.
          </BodyText>
        </header>

        <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIOS.map((t) => (
            <li
              key={t.slug}
              className="group relative flex flex-col gap-5 rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-7"
            >
              {/* Quote decorative — SVG inline sin dependencia de iconset */}
              <svg
                viewBox="0 0 24 24"
                className="absolute right-6 top-6 h-8 w-8 text-[var(--rule-base)]"
                fill="currentColor"
                aria-hidden
              >
                <path d="M10 7H7C5.9 7 5 7.9 5 9v4c0 1.1.9 2 2 2h1v2c0 1.1-.9 2-2 2v2c2.2 0 4-1.8 4-4V9c0-1.1-.9-2-2-2zm10 0h-3c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h1v2c0 1.1-.9 2-2 2v2c2.2 0 4-1.8 4-4V9c0-1.1-.9-2-2-2z" />
              </svg>

              <div className="flex items-center gap-3">
                <IconBadge size="lg" shape="circle" intent="muted">
                  <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
                    {t.initials}
                  </span>
                </IconBadge>
                <div className="flex flex-col">
                  <CardTitle className="text-[length:var(--ts-base)] font-bold leading-tight">
                    {t.name}
                  </CardTitle>
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {t.role}
                  </span>
                </div>
              </div>

              <BodyText className="text-[length:var(--ts-sm)] text-[var(--text-primary)] leading-relaxed italic">
                &ldquo;{t.quote}&rdquo;
              </BodyText>

              <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {t.feature}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default TestimoniosEditorial;
