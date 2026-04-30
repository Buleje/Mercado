"use client";

/**
 * BodegueroSpotlight — card editorial storytelling del bodeguero del mes.
 *
 * Diseño: split 2 columnas (editorial photo + quote), bg surface-sunken,
 * tipografía black grande, quote con quote marks decorativos.
 *
 * Psicología: humanizar las tiendas detrás del marketplace genera empatía
 * y confianza. "Conoce a la persona que te vende" es uno de los principales
 * drivers de fidelidad en marketplaces locales.
 *
 * Bug Hunter Report 2026-04-30 P2-3: ANTES tenia 3 bodegueros hardcoded
 * con slugs que no existen en DB (Don Pepe, Doña Elena, Carlos) — los
 * clicks llevaban a 404 y el storytelling era ficticio.
 *
 * AHORA: el componente queda DESACTIVADO (return null) hasta que exista
 * un endpoint /api/marketplace/featured-bodeguero con datos reales de
 * un CMS de bodegueros. Cuando exista, descomentar la rotación y conectar
 * al fetch.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Quote, Star, MapPin, Store as StoreIcon } from "@buleje/design-system/icons";

type Bodeguero = {
  id: string;
  name: string;
  tienda: string;
  storeSlug: string;
  zona: string;
  yearsActive: number;
  quote: string;
  initial: string;
  rating: number;
};

const BODEGUEROS: Bodeguero[] = [
  {
    id: "1",
    name: "Don Pepe",
    tienda: "Bodega Don Pepe",
    storeSlug: "bodega-don-pepe",
    zona: "Yarinacocha",
    yearsActive: 7,
    quote:
      "Vendo arroz desde antes de que existiera el delivery. Aquí cada cliente se vuelve amigo del barrio.",
    initial: "P",
    rating: 4.9,
  },
  {
    id: "2",
    name: "Doña Elena",
    tienda: "Frutas de la Selva",
    storeSlug: "frutas-de-la-selva",
    zona: "Pucallpa Centro",
    yearsActive: 12,
    quote:
      "Trabajo con productores de Ucayali — el aguaje y el camu camu vienen directo de chacras familiares.",
    initial: "E",
    rating: 4.8,
  },
  {
    id: "3",
    name: "Carlos",
    tienda: "Carnicería Centro",
    storeSlug: "carniceria-centro",
    zona: "Manantay",
    yearsActive: 5,
    quote:
      "Mi pollo es del día. Si te llega después del horario, te devuelvo el dinero — así de simple.",
    initial: "C",
    rating: 4.95,
  },
];

const ROTATE_MS = 12_000;

export default function BodegueroSpotlight() {
  // Bug Hunter P2-3 fix 2026-04-30: deshabilitado hasta CMS real.
  // El componente carga el código pero no renderiza — preserva el dynamic
  // import + bundle split sin mostrar contenido falso al cliente.
  return null;

  // ── CÓDIGO DE LA UI MANTENIDO PARA REUSO POST-CMS ──
  // Cuando exista /api/marketplace/featured-bodeguero, cambiar el return
  // null arriba por: const [bodeguero, setBodeguero] = useState(null);
  // useEffect(fetch + setBodeguero); if (!bodeguero) return null;
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % BODEGUEROS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const b = BODEGUEROS[idx];
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return (
    <section
      aria-label="Conoce a tu bodeguero"
      className="w-full py-8 sm:py-12"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6 pb-4 border-b border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Detrás del mostrador
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Conoce a tu bodeguero
          </h2>
          <p className="mt-2 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            Las personas reales detrás de cada pedido en Buleje.
          </p>
        </header>

        <div
          key={b.id}
          className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-10 items-stretch animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {/* Editorial photo column */}
          <Link
            href={`/marketplace/${b.storeSlug}`}
            className="group relative overflow-hidden rounded-2xl bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)] border border-[var(--rule-soft)] aspect-square lg:aspect-auto min-h-[280px] flex flex-col items-center justify-center text-center p-8 transition-all duration-300 hover:border-[var(--accent)]/30"
          >
            {/* Decorative accent blob — solo accent, sin colores random */}
            <div
              aria-hidden
              className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-[var(--accent)]/[0.06] blur-3xl transition-all duration-500 group-hover:bg-[var(--accent)]/15 group-hover:scale-110"
            />
            <div
              aria-hidden
              className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
            />
            <span className="relative flex h-32 w-32 sm:h-40 sm:w-40 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-5xl sm:text-6xl font-black mb-4 group-hover:scale-105 transition-transform">
              {b.initial}
            </span>
            <p className="relative text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight">
              {b.name}
            </p>
            <p className="relative mt-1 text-[length:var(--ts-sm)] text-[var(--text-secondary)] inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> {b.zona}
            </p>
            <span className="relative mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">
              <Star
                className="h-3 w-3 fill-[var(--data-warning)] text-[var(--data-warning)]"
                strokeWidth={1.75}
                aria-hidden
              />
              {b.rating} · {b.yearsActive} años activo
            </span>
          </Link>

          {/* Quote + CTA column */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-10">
            <div>
              <Quote
                className="h-10 w-10 sm:h-14 sm:w-14 text-[var(--accent)]/30 mb-3"
                strokeWidth={1}
                aria-hidden
              />
              <blockquote className="text-xl sm:text-2xl lg:text-3xl font-bold text-[var(--text-primary)] leading-[1.3] tracking-[var(--ls-tight)]">
                &ldquo;{b.quote}&rdquo;
              </blockquote>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 flex-wrap pt-6 border-t border-[var(--rule-soft)]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <StoreIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                    {b.tienda}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Bodeguero del mes
                  </p>
                </div>
              </div>
              <Link
                href={`/marketplace/${b.storeSlug}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-[length:var(--ts-sm)] font-semibold hover:bg-[var(--text-primary)]/90 transition-colors"
              >
                Visitar tienda
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </Link>
            </div>
          </div>
        </div>

        {/* Indicators */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {BODEGUEROS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Bodeguero ${i + 1}`}
              aria-current={i === idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx
                  ? "w-8 bg-[var(--text-primary)]"
                  : "w-2 bg-[var(--rule-base)] hover:bg-[var(--rule-mid)]"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
