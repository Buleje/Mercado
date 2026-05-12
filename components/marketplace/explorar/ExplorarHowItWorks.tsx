"use client";

/**
 * ExplorarHowItWorks — Sección "Cómo funciona" minimalista.
 *
 * 3 pasos en mismo tono (surface-raised neutro). Acento brand en
 * números, ícono y conector. Tipografía protagonista.
 */

import Link from "next/link";
import {
  Search,
  ShoppingBag,
  Truck,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

interface Step {
  num: string;
  icon: LucideIcon;
  title: string;
  description: string;
  chip: string;
}

const STEPS: Step[] = [
  {
    num: "01",
    icon: Search,
    title: "Buscá tu bodega",
    description:
      "Filtrá por barrio, categoría o lo que necesités. Mostramos solo las que están abiertas ahora.",
    chip: "Cerca de tu casa",
  },
  {
    num: "02",
    icon: ShoppingBag,
    title: "Armá el pedido",
    description:
      "Agregá productos al carrito, sumá modificadores y notas. Vas viendo el total en vivo.",
    chip: "Precio claro",
  },
  {
    num: "03",
    icon: Truck,
    title: "Pagá y recibí",
    description:
      "Yape, Plin o efectivo al recibir. Te llega a la puerta en 25 min promedio.",
    chip: "Pago seguro",
  },
];

export default function ExplorarHowItWorks() {
  return (
    <section className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <header className="max-w-2xl mb-10 sm:mb-14">
        <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
          <span className="h-[3px] w-8 rounded-full bg-[var(--accent)]" aria-hidden />
          Cómo funciona
        </p>
        <h2 className="font-display text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
          De buscar a recibir{" "}
          <span className="text-[var(--accent)]">en 3 pasos.</span>
        </h2>
        <p className="mt-4 text-base sm:text-lg lg:text-xl text-[var(--text-secondary)] leading-snug font-semibold">
          Sin formularios largos, sin tarjetas, sin repartidores que nunca llegan.
        </p>
      </header>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
        {/* Connector line desktop */}
        <div
          aria-hidden
          className="hidden md:block absolute top-[88px] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent z-0"
        />

        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.num}
              className="group relative rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-7 transition-all hover:-translate-y-1 hover:shadow-lg hover:border-[var(--accent)]/40"
            >
              {/* Big number watermark */}
              <span
                className="pointer-events-none absolute top-3 right-5 font-display text-7xl sm:text-8xl font-extrabold text-[var(--surface-sunken)] leading-none select-none"
                aria-hidden
              >
                {s.num}
              </span>

              <div className="relative">
                {/* Icon en surface neutral, accent en hover */}
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-all group-hover:bg-[var(--accent)] group-hover:text-white group-hover:scale-105">
                  <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>

                <p className="mt-5 text-xs font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                  Paso {s.num}
                </p>
                <h3 className="mt-1.5 font-display text-2xl sm:text-3xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-[1.05]">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm sm:text-base text-[var(--text-secondary)] leading-snug font-semibold">
                  {s.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--text-secondary)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                    aria-hidden
                  />
                  {s.chip}
                </span>
              </div>

              {/* Step number badge — esquina inferior */}
              <span
                className="absolute bottom-5 right-5 font-mono text-xs font-bold text-[var(--text-tertiary)] opacity-50"
                aria-hidden
              >
                {idx + 1} / {STEPS.length}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-10 sm:mt-12 flex justify-center">
        <Link
          href="/marketplace"
          className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base sm:text-lg font-black uppercase tracking-wider shadow-xl hover:bg-[var(--accent)] hover:gap-3 transition-all"
        >
          Empezar a comprar
          <ArrowUpRight
            className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.75}
            aria-hidden
          />
        </Link>
      </div>
    </section>
  );
}
