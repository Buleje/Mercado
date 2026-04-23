"use client";

/**
 * PopularCategoriesTiles — 6 category tiles con ilustraciones del DS.
 * Click → /marketplace?categoria=X (filtro).
 * Estilo: card neutra, hover-scale sutil, ilustracion currentColor que hereda
 * el teal del tema cuando la card es activa (hover).
 */

import Link from "next/link";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations/categories";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";

const POPULAR_CATEGORIES = [
  {
    slug: "frutas-verduras",
    label: "Frutas y verduras",
    desc: "Frescas del mercado",
    Illustration: VerduraFresca,
  },
  {
    slug: "carnes",
    label: "Carnicería",
    desc: "Pollo, res, cerdo",
    Illustration: CarniceriaFresca,
  },
  {
    slug: "lacteos",
    label: "Lácteos",
    desc: "Leche, queso, yogurt",
    Illustration: LacteosRefresh,
  },
  {
    slug: "bebidas",
    label: "Bebidas",
    desc: "Gaseosas, agua, jugos",
    Illustration: BebidasVarias,
  },
  {
    slug: "limpieza",
    label: "Limpieza",
    desc: "Todo para tu hogar",
    Illustration: LimpiezaDomicilio,
  },
  {
    slug: "abarrotes",
    label: "Abarrotes",
    desc: "Arroz, fideos, aceite",
    Illustration: BodegaAbriendo,
  },
] as const;

export default function PopularCategoriesTiles() {
  return (
    <section
      aria-label="Categorías populares"
      className="relative bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)] py-20 sm:py-28"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 sm:mb-18">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Categorías populares
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Pide lo que
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                necesitas.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Productos de todas las bodegas, organizados para que los encuentres
            al toque.
          </p>
        </div>

        {/* Grid px-spaced — mismo patrón que ComoFuncionaSection y Beneficios */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden">
          {POPULAR_CATEGORIES.map((cat, i) => {
            const Illustration = cat.Illustration;
            return (
              <RevealOnScroll key={cat.slug} delayMs={i * 50}>
                <Link
                  href={`/marketplace?categoria=${cat.slug}`}
                  className="group relative flex h-full flex-col items-center gap-3 bg-[var(--surface-raised)] px-4 py-7 transition-colors hover:bg-[var(--surface-canvas)]"
                >
                  <div className="h-20 w-20 flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors">
                    <Illustration size={72} strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black tracking-[-0.01em] text-[var(--text-primary)]">
                      {cat.label}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                      {cat.desc}
                    </p>
                  </div>
                </Link>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
