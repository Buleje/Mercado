"use client";

/**
 * PopularCategoriesTiles — 6 category tiles con ilustraciones del DS.
 * Click → /marketplace?categoria=X (filtro).
 * Estilo: card neutra, hover-scale sutil, ilustracion currentColor que hereda
 * el teal del tema cuando la card es activa (hover).
 */

import Link from "next/link";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import { useLocale } from "@/contexts/locale-context";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations/categories";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";

// Cada categoría tiene su propia "personalidad cromática" — un acento sutil
// del verde-naturaleza para frutas, rojo cálido para carnes, azul fresco
// para lácteos, etc. Mantiene cohesión con la marca al usar el teal en
// estados hover/active y kickers; los acentos por categoría sólo aportan
// pulsación visual al ilustración y al fondo soft.
const POPULAR_CATEGORIES = [
  {
    slug: "frutas-verduras",
    label: "Frutas y verduras",
    desc: "Frescas del mercado",
    Illustration: VerduraFresca,
    accent: "#16a34a", // green-600
    soft: "rgba(22,163,74,0.08)",
  },
  {
    slug: "carnes",
    label: "Carnicería",
    desc: "Pollo, res, cerdo",
    Illustration: CarniceriaFresca,
    accent: "#dc2626", // red-600
    soft: "rgba(220,38,38,0.07)",
  },
  {
    slug: "lacteos",
    label: "Lácteos",
    desc: "Leche, queso, yogurt",
    Illustration: LacteosRefresh,
    accent: "#0ea5e9", // sky-500
    soft: "rgba(14,165,233,0.08)",
  },
  {
    slug: "bebidas",
    label: "Bebidas",
    desc: "Gaseosas, agua, jugos",
    Illustration: BebidasVarias,
    accent: "#0891b2", // cyan-600
    soft: "rgba(8,145,178,0.08)",
  },
  {
    slug: "limpieza",
    label: "Limpieza",
    desc: "Todo para tu hogar",
    Illustration: LimpiezaDomicilio,
    accent: "#7c3aed", // violet-600
    soft: "rgba(124,58,237,0.07)",
  },
  {
    slug: "abarrotes",
    label: "Abarrotes",
    desc: "Arroz, fideos, aceite",
    Illustration: BodegaAbriendo,
    accent: "#d97706", // amber-600
    soft: "rgba(217,119,6,0.08)",
  },
] as const;

export default function PopularCategoriesTiles() {
  const { t } = useLocale();
  return (
    <section
      aria-label="Categorías populares"
      className="relative bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)] py-20 sm:py-28"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 sm:mb-18">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              {t("landing.categories.kicker")}
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              {t("landing.categories.title")}{" "}
              <br />
              <span className="text-[var(--accent)]">
                {t("landing.categories.titleAccent")}
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            {t("landing.categories.description")}
          </p>
        </div>

        {/* Grid de cards independientes — cada tile tiene personalidad
            cromática propia (no es ya el grid uniforme blanco). */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {POPULAR_CATEGORIES.map((cat, i) => {
            const Illustration = cat.Illustration;
            return (
              <RevealOnScroll key={cat.slug} delayMs={i * 60}>
                <Link
                  href={`/marketplace?categoria=${cat.slug}`}
                  className="group relative flex h-full flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-7 transition-all hover:-translate-y-1 hover:shadow-xl"
                  style={
                    {
                      ["--cat-accent" as never]: cat.accent,
                      ["--cat-soft" as never]: cat.soft,
                    } as React.CSSProperties
                  }
                >
                  {/* Background tinted que aparece al hover */}
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 0%, var(--cat-soft) 0%, transparent 70%)",
                    }}
                  />
                  {/* Border tonal lateral izquierdo en hover */}
                  <div
                    aria-hidden
                    className="absolute left-0 top-0 h-full w-1 origin-bottom scale-y-0 transition-transform duration-300 group-hover:scale-y-100"
                    style={{ backgroundColor: "var(--cat-accent)" }}
                  />
                  {/* Ilustración con bg circle tonal */}
                  <div
                    className="relative h-24 w-24 flex items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110"
                    style={{ backgroundColor: "var(--cat-soft)" }}
                  >
                    <span
                      className="transition-colors"
                      style={{ color: "var(--cat-accent)" }}
                    >
                      <Illustration size={64} strokeWidth={1.75} />
                    </span>
                  </div>
                  <div className="relative text-center">
                    <p className="text-[length:var(--ts-base)] font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
                      {cat.label}
                    </p>
                    <p className="mt-1 text-[length:var(--ts-sm)] font-medium text-[var(--text-tertiary)]">
                      {cat.desc}
                    </p>
                  </div>
                  {/* Badge "Ver →" que aparece al hover */}
                  <span
                    className="relative inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ color: "var(--cat-accent)" }}
                  >
                    Ver
                    <span aria-hidden>→</span>
                  </span>
                </Link>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
