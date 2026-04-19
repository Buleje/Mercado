"use client";

/**
 * ComparedProductsSection — Cross-sell al comparador /marketplace/comparar.
 *
 * Muestra 4 productos "populares en comparacion" con un CTA al comparador
 * completo. Data es mock local; cuando exista tabla de metricas de uso del
 * comparador se reemplaza por fetch a endpoint real.
 *
 * Ola 7: migrado al primitivo ProductCardCompact del DS. Antes usaba un
 * ComparedCard local con link al comparador; ahora usa el primitivo
 * canonico con `href` custom apuntando al comparador (`/marketplace/comparar?q=...`).
 */

import Link from "next/link";
import {
  CardTitle,
  Caption,
  Kicker,
  ProductCardCompact,
  type ProductCardProduct,
} from "@buleje/design-system";
import {
  ArrowRight,
  GitCompareArrows,
} from "@buleje/design-system/icons";

type ComparedProduct = {
  id: string;
  name: string;
  category: string;
  comparedToday: number;
  priceFrom: number;
  stores: number;
  href: string;
};

const PRODUCTS: ComparedProduct[] = [
  {
    id: "arroz-extra-5kg",
    name: "Arroz Costeno extra 5 kg",
    category: "Abarrotes",
    comparedToday: 142,
    priceFrom: 22.9,
    stores: 8,
    href: "/marketplace/comparar?q=arroz-costeno-5kg",
  },
  {
    id: "aceite-primor-1l",
    name: "Aceite Primor 1 L",
    category: "Abarrotes",
    comparedToday: 98,
    priceFrom: 8.5,
    stores: 6,
    href: "/marketplace/comparar?q=aceite-primor-1l",
  },
  {
    id: "leche-gloria-caja",
    name: "Leche Gloria evaporada 400 g",
    category: "Lacteos",
    comparedToday: 87,
    priceFrom: 4.2,
    stores: 7,
    href: "/marketplace/comparar?q=leche-gloria-400g",
  },
  {
    id: "detergente-ariel-kg",
    name: "Detergente Ariel 1 kg",
    category: "Limpieza",
    comparedToday: 63,
    priceFrom: 14.9,
    stores: 5,
    href: "/marketplace/comparar?q=detergente-ariel-1kg",
  },
];

function comparedToCard(p: ComparedProduct): ProductCardProduct {
  return {
    id: p.id,
    name: p.name,
    price: p.priceFrom,
    image: null,
    category: p.category,
    href: p.href,
  };
}

export default function ComparedProductsSection() {
  return (
    <section
      aria-labelledby="compared-title"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
            <GitCompareArrows
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <Kicker className="text-[var(--text-tertiary)]">
              Populares en el comparador
            </Kicker>
            <CardTitle
              id="compared-title"
              className="text-[length:var(--ts-lg)]"
            >
              Productos comparados por tus vecinos
            </CardTitle>
            <Caption className="mt-0.5 text-[var(--text-tertiary)]">
              Mira como varia el precio del mismo producto en distintas bodegas.
            </Caption>
          </div>
        </div>
        <Link
          href="/marketplace/comparar"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Comparar con otros
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* ProductCardCompact (Ola 7) — carousel horizontal de comparados */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="shrink-0 snap-start">
            <ProductCardCompact product={comparedToCard(p)} />
            <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] px-2 w-[160px] sm:w-[180px]">
              {p.stores} tiendas · {p.comparedToday} comparaciones hoy
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
