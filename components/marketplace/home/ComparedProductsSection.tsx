"use client";

/**
 * ComparedProductsSection — Cross-sell al comparador /marketplace/comparar.
 *
 * Muestra 4 productos "populares en comparacion" con badge "En comparacion"
 * y CTA al comparador completo. Data es mock local; cuando exista tabla de
 * metricas de uso del comparador se reemplaza por fetch a endpoint real.
 */

import Link from "next/link";
import {
  ArrowRight,
  GitCompareArrows,
} from "@buleje/design-system/icons";
import { CardTitle, Caption, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

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

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function ComparedCard({ product }: { product: ComparedProduct }) {
  return (
    <Link
      href={product.href}
      className={cn(
        "group flex flex-col rounded-xl border border-[var(--rule-base)]",
        "bg-white dark:bg-gray-900 overflow-hidden transition-colors",
        "hover:border-[var(--rule-strong)]",
      )}
    >
      <div className="relative aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
        <span
          className={cn(
            "absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5",
            "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
            "bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
            "border border-[var(--rule-base)]",
          )}
        >
          <GitCompareArrows className="h-3 w-3" aria-hidden />
          En comparacion
        </span>
        <span
          className="text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-tertiary)]/30 tracking-tight"
          aria-hidden
        >
          {product.category.slice(0, 3).toUpperCase()}
        </span>
      </div>
      <div className="p-3">
        <Caption className="text-[var(--text-tertiary)] uppercase tracking-wide">
          {product.category}
        </Caption>
        <h3 className="mt-0.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] leading-tight line-clamp-2 h-10">
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Desde
          </span>
          <span className="text-[length:var(--ts-base)] font-extrabold text-[var(--text-primary)] tabular-nums">
            {fmt(product.priceFrom)}
          </span>
        </div>
        <div className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {product.stores} tiendas · {product.comparedToday} comparaciones hoy
        </div>
      </div>
    </Link>
  );
}

export default function ComparedProductsSection() {
  return (
    <section
      aria-labelledby="compared-title"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
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
          className={cn(
            "inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
          )}
        >
          Comparar con otros
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PRODUCTS.map((p) => (
          <ComparedCard key={p.id} product={p} />
        ))}
      </div>

      <div className="sm:hidden -mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="shrink-0 w-[160px] snap-start">
            <ComparedCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
