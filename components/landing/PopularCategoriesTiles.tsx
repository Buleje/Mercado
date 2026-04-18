"use client";

/**
 * PopularCategoriesTiles — 6 category tiles con ilustraciones del DS.
 * Click → /marketplace?categoria=X (filtro).
 * Estilo: card neutra, hover-scale sutil, ilustracion currentColor que hereda
 * el teal del tema cuando la card es activa (hover).
 */

import Link from "next/link";
import { m } from "framer-motion";
import { SectionHeader } from "@/components/ui-system";
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
    <section className="py-16 sm:py-20 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Categorías populares"
          title="Pedí lo que necesitás"
          description="Productos de todas las bodegas, organizados para que los encuentres al toque."
          size="md"
          ruled
          className="mb-8"
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {POPULAR_CATEGORIES.map((cat, i) => {
            const Illustration = cat.Illustration;
            return (
              <m.div
                key={cat.slug}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  href={`/marketplace?categoria=${cat.slug}`}
                  className="group relative flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-5 transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="h-20 w-20 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:text-primary transition-colors">
                    <Illustration size={72} strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">
                      {cat.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      {cat.desc}
                    </p>
                  </div>
                </Link>
              </m.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
