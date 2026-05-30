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
        <header className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Vecinos contentos
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            <span className="text-[var(--accent)]">5.4k</span> vecinos ya confían en Buleje
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Familias reales de Pucallpa contando lo que les gustó.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
          {REVIEWS.map((r, idx) => (
            <article
              key={idx}
              className="group relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-7 transition-all hover:border-[var(--rule-strong)] hover:shadow-md"
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
              <p className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-relaxed">
                &ldquo;{r.text}&rdquo;
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-3 pt-5 border-t border-[var(--rule-base)]">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white text-lg font-extrabold">
                  {r.initial}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
                    {r.name}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">{r.zone}, Pucallpa</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
