"use client";

/**
 * Testimonials — quotes rotativos de clientes reales (mock).
 *
 * Lenguaje visual idéntico a BodegueroSpotlight:
 *   - Split 2-col (avatar + quote tipográfica grande)
 *   - Quote marks decorativos
 *   - Rotación automática cada 10s
 *   - Indicators tipo barra
 *
 * Psicología: testimonios son el #1 driver de conversion en marketplaces.
 * Ver el rostro y zona de un vecino real reduce fricción del primer pedido.
 */

import { useEffect, useState } from "react";
import { Star, Quote, MapPin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Testimonial = {
  id: string;
  initial: string;
  name: string;
  zone: string;
  rating: number;
  quote: string;
};

const TESTIMONIOS: Testimonial[] = [
  {
    id: "1",
    initial: "M",
    name: "Mariana López",
    zone: "Pucallpa Centro",
    rating: 5,
    quote:
      "Pide a las 7 PM y me llegó antes de las 7:30. Pollo fresco, todo bien empacado. Es como tener una bodega en mi celular.",
  },
  {
    id: "2",
    initial: "R",
    name: "Roberto Vargas",
    zone: "Yarinacocha",
    rating: 5,
    quote:
      "Compro toda la canasta del mes en una sola vez. El cupón BIENVENIDO10 me hizo ahorrar S/15 en mi primera compra. Vuelvo cada semana.",
  },
  {
    id: "3",
    initial: "S",
    name: "Sofía Ramírez",
    zone: "Manantay",
    rating: 5,
    quote:
      "Lo que más me gusta es que pago al recibir. Sin tarjetas, sin riesgo. El repartidor cobra en la puerta. Confianza total.",
  },
];

const ROTATE_MS = 10_000;

export default function Testimonials() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIOS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const t = TESTIMONIOS[idx];

  return (
    <section
      aria-label="Testimonios de clientes"
      className="w-full py-8 sm:py-12"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6 pb-4 border-b border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Voces del barrio
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Lo que dicen tus vecinos
          </h2>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            Compradores reales de Ciudad Constitución. Sin filtro.
          </p>
        </header>

        <div
          key={t.id}
          className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-10 items-stretch animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {/* Avatar editorial column */}
          <div className="relative overflow-hidden rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)] border border-[var(--rule-soft)] aspect-square lg:aspect-auto min-h-[280px]">
            {/* Decorative blobs accent */}
            <div
              aria-hidden
              className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
            />
            <span className="relative flex h-32 w-32 sm:h-40 sm:w-40 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-5xl sm:text-6xl font-black mb-4">
              {t.initial}
            </span>
            <p className="relative text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight">
              {t.name}
            </p>
            <p className="relative mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> {t.zone}
            </p>
            <div className="relative mt-3 flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-4 w-4",
                    i < t.rating
                      ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                      : "text-[var(--rule-base)]",
                  )}
                  strokeWidth={1.75}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          {/* Quote column */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-10">
            <div>
              <Quote
                className="h-10 w-10 sm:h-14 sm:w-14 text-[var(--accent)]/30 mb-3"
                strokeWidth={1}
                aria-hidden
              />
              <blockquote className="text-xl sm:text-2xl lg:text-3xl font-bold text-[var(--text-primary)] leading-[1.3] tracking-[var(--ls-tight)]">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
            </div>

            <div className="mt-6 pt-6 border-t border-[var(--rule-soft)]">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Cliente verificado · Compra reciente
              </p>
            </div>
          </div>
        </div>

        {/* Indicators */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {TESTIMONIOS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Testimonio ${i + 1}`}
              aria-current={i === idx}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === idx
                  ? "w-8 bg-[var(--text-primary)]"
                  : "w-2 bg-[var(--rule-base)] hover:bg-[var(--rule-mid)]",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
