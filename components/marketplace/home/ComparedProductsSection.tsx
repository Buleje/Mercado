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
import { ArrowRight } from "@buleje/design-system/icons";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

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
  {
    id: "panetela-san-jorge",
    name: "Panetela San Jorge 900 g",
    category: "Abarrotes",
    comparedToday: 54,
    priceFrom: 12.5,
    stores: 4,
    href: "/marketplace/comparar?q=panetela-san-jorge",
  },
  {
    id: "gaseosa-inca-kola-3l",
    name: "Inca Kola 3 L",
    category: "Bebidas",
    comparedToday: 41,
    priceFrom: 10.9,
    stores: 9,
    href: "/marketplace/comparar?q=inca-kola-3l",
  },
];

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function ComparedProductsSection() {
  return (
    <MarketplaceSection
      id="compared"
      kicker="Populares en el comparador"
      title="Productos comparados por tus vecinos"
      subtitle="Mira como varia el precio del mismo producto en distintas bodegas."
      actions={
        <Link
          href="/marketplace/comparar"
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Comparar con otros
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      <HorizontalCarousel ariaLabel="Productos comparados por tus vecinos">
        {PRODUCTS.map((p, i) => (
          <UnifiedProductCard
            key={p.id}
            index={i}
            href={p.href}
            product={{
              id: hashId(p.id),
              name: p.name,
              price: p.priceFrom,
              category: p.category,
              image: null,
              description: `${p.stores} tiendas · ${p.comparedToday} comparaciones hoy`,
            }}
          />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
