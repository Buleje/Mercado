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
      <header className="mx-auto max-w-2xl text-center mb-10 sm:mb-14">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Cómo funciona
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          De buscar a recibir{" "}
          <span className="text-[var(--accent)]">en 3 pasos</span>
        </h2>
        <p className="mt-3 text-[var(--text-secondary)]">
          Sin formularios largos, sin tarjetas, sin repartidores que nunca llegan.
        </p>
      </header>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
        {/* Connector line desktop */}
        <div
          aria-hidden
          className="hidden md:block absolute top-[88px] left-[16%] right-[16%] h-px bg-linear-to-r from-transparent via-[var(--accent)]/40 to-transparent z-0"
        />

        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.num}
              className="group relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-7 transition-all hover:border-[var(--rule-strong)] hover:shadow-md"
            >
              {/* Big number watermark */}
              <span
                className="pointer-events-none absolute top-3 right-5 text-6xl sm:text-7xl font-extrabold text-[var(--surface-sunken)] leading-none select-none tabular-nums"
                aria-hidden
              >
                {s.num}
              </span>

              <div className="relative">
                {/* Icon en surface neutral, accent en hover */}
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-all group-hover:bg-[var(--accent)] group-hover:text-white group-hover:scale-105">
                  <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>

                <p className="mt-5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Paso {s.num}
                </p>
                <h3 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {s.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
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
          className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base sm:text-lg font-bold tracking-tight shadow-sm hover:bg-[var(--accent)] hover:gap-3 transition-all"
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
