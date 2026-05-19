"use client";

/**
 * ExplorarTestimonials — Reseñas minimalistas.
 *
 * Mismo tono surface-raised. Acento brand solo en avatares y stars
 * amber. Tipografía dominante.
 */

import { Star, Quote } from "@buleje/design-system/icons";

interface Review {
  initial: string;
  name: string;
  zone: string;
  text: string;
  rating: number;
}

const REVIEWS: Review[] = [
  {
    initial: "M",
    name: "María C.",
    zone: "Yarinacocha",
    text: "Pedí pollo a la brasa un domingo a las 8pm y llegó calentito en 22 min. Mi marido pensó que había salido a comprar.",
    rating: 5,
  },
  {
    initial: "J",
    name: "José R.",
    zone: "Manantay",
    text: "Antes iba a 3 bodegas para conseguir todo. Ahora hago una sola compra y me llega todo junto. Salvador de tiempo.",
    rating: 5,
  },
  {
    initial: "A",
    name: "Ana T.",
    zone: "Callería",
    text: "Pago con Yape y listo. Sin tarjetas, sin cargos raros. Mi mamá de 60 años aprendió a usarlo en un día.",
    rating: 5,
  },
];

export default function ExplorarTestimonials() {
  return (
    <section className="bg-[var(--surface-canvas)] py-12 sm:py-20">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <header className="max-w-3xl mx-auto text-center mb-10 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
            <span className="h-[3px] w-8 rounded-full bg-[var(--accent)]" aria-hidden />
            Vecinos contentos
          </p>
          <h2 className="font-display text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
            <span className="text-[var(--accent)]">5.4k</span> vecinos
            ya confían en Buleje
          </h2>
          <p className="mt-4 text-base sm:text-lg lg:text-xl text-[var(--text-secondary)] max-w-xl mx-auto font-semibold leading-snug">
            Familias reales de Pucallpa contando lo que les gustó.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
          {REVIEWS.map((r, idx) => (
            <article
              key={idx}
              className="group relative rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-7 transition-all hover:-translate-y-1 hover:shadow-lg hover:border-[var(--accent)]/40"
            >
              {/* Quote watermark — muy sutil */}
              <Quote
                className="absolute top-5 right-5 h-12 w-12 text-[var(--surface-sunken)]"
                strokeWidth={1.5}
                aria-hidden
              />

              {/* Stars amber — única excepción de color, son universales */}
              <div className="flex items-center gap-0.5 mb-4">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                    aria-hidden
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="font-display text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-snug tracking-tight">
                &ldquo;{r.text}&rdquo;
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-3 pt-5 border-t border-[var(--rule-soft)]">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white font-display text-lg font-extrabold shadow-md shadow-[var(--accent)]/25">
                  {r.initial}
                </span>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {r.name}
                  </p>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)]">{r.zone}, Pucallpa</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
