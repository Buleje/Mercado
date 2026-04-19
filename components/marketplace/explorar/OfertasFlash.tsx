"use client";

/**
 * OfertasFlash — Grid de ofertas de la semana.
 * Cards con ilustracion fallback + ProductBadge teal soft.
 * 2x2 mobile / 3 tablet / 4 desktop.
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

interface OfertaCard {
  id: string;
  title: string;
  discount: string;
  subtitle: string;
  Illustration: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
}

const OFERTAS: OfertaCard[] = [
  {
    id: "of-1",
    title: "Verduras frescas del dia",
    discount: "-15%",
    subtitle: "Mercado Bellavista",
    Illustration: VerduraFresca,
    href: "/marketplace?categoria=verduras",
  },
  {
    id: "of-2",
    title: "Pollo nacional fresco",
    discount: "-20%",
    subtitle: "Carniceria Centro",
    Illustration: CarniceriaFresca,
    href: "/marketplace?categoria=carnes",
  },
  {
    id: "of-3",
    title: "Yogurt Gloria 1L",
    discount: "-10%",
    subtitle: "Varias tiendas",
    Illustration: LacteosRefresh,
    href: "/marketplace?categoria=lacteos",
  },
  {
    id: "of-4",
    title: "Inca Kola 3L",
    discount: "-12%",
    subtitle: "Bodega Callerita",
    Illustration: BebidasVarias,
    href: "/marketplace?categoria=bebidas",
  },
  {
    id: "of-5",
    title: "Detergente Ace 4.5kg",
    discount: "-18%",
    subtitle: "Buleje",
    Illustration: LimpiezaDomicilio,
    href: "/marketplace?categoria=limpieza",
  },
  {
    id: "of-6",
    title: "Paiche ahumado Pucallpa",
    discount: "-25%",
    subtitle: "Mercado Central",
    Illustration: PaicheEnOlla,
    href: "/marketplace?categoria=pescados",
  },
];

export default function OfertasFlash() {
  return (
    <MarketplaceSection
      id="ofertas-destacadas"
      kicker="Esta semana"
      title="Ofertas destacadas"
      actions={
        <Link
          href="/marketplace/ofertas"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline shrink-0"
        >
          Ver todas
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </Link>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {OFERTAS.map((oferta) => {
          const Ill = oferta.Illustration;
          return (
            <Link
              key={oferta.id}
              href={oferta.href}
              className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              {/* Badge descuento */}
              <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-primary border border-primary/20">
                {oferta.discount}
              </span>

              {/* Ilustracion fallback (no fotos stock) */}
              <div className="aspect-square bg-gray-50 dark:bg-gray-950 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-800">
                <Ill size={80} strokeWidth={1.5} />
              </div>

              <div className="p-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">
                  {oferta.title}
                </h3>
                <p className="mt-1 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                  {oferta.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </MarketplaceSection>
  );
}
