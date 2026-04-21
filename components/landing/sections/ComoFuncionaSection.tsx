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

const PASOS = [
  {
    num: "01",
    icon: Search,
    title: "Encontrá tu bodega",
    desc: "Filtrá por distrito, categoría o nombre. Ves los que están abiertos y entregan a tu zona.",
    tag: "Descubrí",
  },
  {
    num: "02",
    icon: ShoppingBag,
    title: "Armá tu pedido",
    desc: "Elegí productos de una o varias bodegas. Agregá notas, elegí cantidades, ajustá lo que quieras.",
    tag: "Añadí al carrito",
  },
  {
    num: "03",
    icon: CreditCard,
    title: "Pagá como prefieras",
    desc: "Yape, Plin, efectivo contra entrega o tarjeta. Sin sorpresas ni cargos ocultos.",
    tag: "Checkout",
  },
  {
    num: "04",
    icon: Bike,
    title: "Recibí en minutos",
    desc: "25-45 min promedio. Seguimiento en tiempo real del repartidor hasta tu puerta.",
    tag: "Delivery",
  },
];

export default function ComoFuncionaSection() {
  return (
    <section
      id="como-funciona"
      aria-label="Cómo funciona"
      className="relative overflow-hidden bg-[var(--surface-raised)] py-20 sm:py-28 lg:py-32 scroll-mt-20"
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
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16 sm:mb-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Cómo funciona
            </p>
            <h2 className="text-[clamp(2.5rem,6.5vw,4.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Cuatro pasos.
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                Cero fricción.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            De encontrar la bodega a recibir el pedido — todo desde tu celular,
            sin llamadas ni filas.
          </p>
        </div>

        {/* Grid de 4 pasos — asimétrico */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden">
          {PASOS.map(({ num, icon: Icon, title, desc, tag }, idx) => (
            <article
              key={num}
              className="group relative bg-[var(--surface-canvas)] p-8 lg:p-10 transition-colors hover:bg-[var(--surface-sunken)]"
            >
              {/* Número gigante de fondo */}
              <span
                aria-hidden
                className="absolute top-6 right-6 text-[clamp(3rem,6vw,5rem)] font-black tabular-nums tracking-[-0.05em] text-[var(--text-primary)]/[0.04] leading-none select-none"
              >
                {num}
              </span>

              {/* Icon box */}
              <div className="relative mb-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
              </div>

              {/* Tag numérico */}
              <div className="relative flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Paso {num}
                </span>
                <span className="h-px flex-1 bg-[var(--rule-soft)]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  {tag}
                </span>
              </div>

              <h3 className="relative text-xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
                {title}
              </h3>
              <p className="relative mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                {desc}
              </p>

              {/* Linker visual entre pasos (solo desktop, no último) */}
              {idx < PASOS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden lg:block absolute top-1/2 -right-[6px] h-3 w-3 rounded-full bg-[var(--accent)] ring-4 ring-[var(--surface-raised)] z-10"
                />
              )}
            </article>
          ))}
        </div>

        {/* Stats de soporte + CTA */}
        <div className="mt-16 sm:mt-20 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-12 items-center">
          <div className="grid grid-cols-3 gap-6 sm:gap-8">
            {[
              { value: "25 min", label: "Delivery promedio" },
              { value: "S/ 0", label: "Comisión en plan Gratis" },
              { value: "24/7", label: "Soporte por WhatsApp" },
            ].map(({ value, label }) => (
              <div
                key={label}
                className="border-l-2 border-[var(--accent)] pl-4"
              >
                <p className="text-[clamp(1.5rem,3vw,2.25rem)] font-black tabular-nums tracking-[-0.03em] text-[var(--text-primary)] leading-none">
                  {value}
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  {label}
                </p>
              </div>
            ))}
          </div>
          <div className="text-center lg:text-right">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-8 py-4 text-base font-bold text-[var(--surface-canvas)] hover:opacity-90 transition-opacity"
            >
              Explorar marketplace
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
