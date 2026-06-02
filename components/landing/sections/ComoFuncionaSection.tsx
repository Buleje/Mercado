/**
 * ComoFuncionaSection — 4 pasos con números gigantes + layout editorial.
 *
 * Estilo: números enormes (01, 02, 03, 04) con clamp fluid,
 * grid asimétrico con paso activo destacado, tono storytelling.
 * Inspiración: Apple product pages, Stripe "How it works", Linear.
 */

import Link from "next/link";
import {
  Search,
  ShoppingBag,
  CreditCard,
  Bike,
} from "@buleje/design-system/icons";
import T from "@/components/T";
import { cn } from "@/lib/utils";

const PASOS = [
  { num: "01", icon: Search,      keyTitle: "landing.how.step1.title", keyDesc: "landing.how.step1.desc", keyTag: "landing.how.step1.tag", time: "2 min" },
  { num: "02", icon: ShoppingBag, keyTitle: "landing.how.step2.title", keyDesc: "landing.how.step2.desc", keyTag: "landing.how.step2.tag", time: "1 día" },
  { num: "03", icon: CreditCard,  keyTitle: "landing.how.step3.title", keyDesc: "landing.how.step3.desc", keyTag: "landing.how.step3.tag", time: "Auto" },
  { num: "04", icon: Bike,        keyTitle: "landing.how.step4.title", keyDesc: "landing.how.step4.desc", keyTag: "landing.how.step4.tag", time: "30 min" },
];

export default function ComoFuncionaSection() {
  return (
    <section
      id="como-funciona"
      aria-label="Cómo funciona"
      className="relative overflow-hidden bg-[var(--surface-raised)] py-10 sm:py-28 lg:py-32 scroll-mt-20"
    >
      {/* Líneas decorativas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6 mb-8 sm:mb-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3 sm:mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              <T k="landing.how.kicker" fallback="Cómo funciona" />
            </p>
            <h2 className="text-[clamp(2.5rem,6.5vw,4.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              <T k="landing.how.title" fallback="Cuatro pasos." />{" "}
              <br />
              <span className="text-[var(--accent)]">
                <T k="landing.how.titleAccent" fallback="Cero fricción." />
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            <T k="landing.how.description" fallback="De abrir tu negocio online a cobrar el primer pedido — todo en una tarde." />
          </p>
        </div>

        {/* Timeline visual: 4 cards con línea conectora horizontal entre pasos.
            v2 (2026-05-10): antes era un grid pegado con número gris fantasma.
            Ahora cada card flota separada, conectada por una línea punteada
            accent + dot bullet, con badge de "tiempo estimado" para urgencia. */}
        <div className="relative">
          {/* Línea conectora horizontal (solo desktop, detrás de las cards) */}
          <div
            aria-hidden
            className="hidden lg:block absolute top-[88px] left-[7%] right-[7%] h-[2px] bg-[repeating-linear-gradient(to_right,var(--accent)_0,var(--accent)_6px,transparent_6px,transparent_12px)] opacity-40 z-0"
          />

          {/* Mobile (Brandon 2026-06-01): FILA COMPACTA (icono + paso/título +
              tiempo). Oculta el número fantasma, la desc y el tag → ocupa ~1/3.
              md+ (2 cols) y lg (4 cols): card vertical editorial completa. */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-5 lg:gap-6 z-10">
            {PASOS.map(({ num, icon: Icon, keyTitle, keyDesc, keyTag, time }) => (
              <article
                key={num}
                className={cn(
                  "group relative overflow-hidden border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] transition-all duration-[var(--dur-base)]",
                  "flex flex-row items-center gap-3 rounded-2xl p-3.5",
                  "md:flex-col md:items-stretch md:gap-0 md:p-7",
                  "md:hover:border-[var(--accent)] md:hover:-translate-y-1 md:hover:shadow-[var(--shadow-lg)]",
                )}
              >
                {/* Número fantasma editorial — solo desktop (en mobile no entra). */}
                <span
                  aria-hidden
                  className="hidden md:block absolute -top-2 right-3 text-[4.5rem] lg:text-[5.5rem] font-black tabular-nums tracking-[-0.05em] text-[var(--rule-base)]/70 leading-none select-none transition-colors duration-[var(--dur-base)] group-hover:text-[var(--accent)]/25"
                >
                  {num}
                </span>

                {/* Icon box — más chico en mobile */}
                <div className="relative shrink-0 md:mb-5">
                  <span
                    aria-hidden
                    className="inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm transition-all duration-[var(--dur-base)] md:group-hover:bg-[var(--accent)] md:group-hover:text-white md:group-hover:scale-105"
                  >
                    <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2} />
                  </span>
                </div>

                <div className="min-w-0 flex-1 md:flex-none">
                  {/* Step label + tiempo */}
                  <div className="flex items-center justify-between gap-2 md:mb-3">
                    <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                      <T k="landing.how.step" fallback="Paso" /> {num}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                      {time}
                    </span>
                  </div>

                  <h3 className="text-base md:text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                    <T k={keyTitle} />
                  </h3>
                  {/* desc — oculta en mobile (compacto) */}
                  <p className="hidden md:block mt-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <T k={keyDesc} />
                  </p>

                  {/* Tag mini bottom — oculto en mobile */}
                  <p className="hidden md:inline-flex mt-4 items-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <T k={keyTag} />
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Stats de soporte + CTA */}
        <div className="mt-8 sm:mt-20 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 sm:gap-12 items-center">
          <div className="grid grid-cols-3 gap-4 sm:gap-8">
            {[
              { keyVal: "landing.how.stat1.value", keyLab: "landing.how.stat1.label" },
              { keyVal: "landing.how.stat2.value", keyLab: "landing.how.stat2.label" },
              { keyVal: "landing.how.stat3.value", keyLab: "landing.how.stat3.label" },
            ].map(({ keyVal, keyLab }) => (
              <div
                key={keyLab}
                className="border-l-2 border-[var(--accent)] pl-4"
              >
                <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-extrabold tabular-nums tracking-[-0.03em] text-[var(--text-primary)] leading-none">
                  <T k={keyVal} />
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
                  <T k={keyLab} />
                </p>
              </div>
            ))}
          </div>
          <div className="text-center lg:text-right">
            <Link
              href="/abrir-tienda"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-8 py-4 text-base font-bold text-[var(--surface-canvas)] hover:opacity-90 transition-opacity"
            >
              <T k="landing.how.cta" fallback="Prueba el primer mes sin pagar" />
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
