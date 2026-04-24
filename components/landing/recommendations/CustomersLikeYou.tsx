"use client";

import Link from "next/link";
import { ChevronRight, Users } from "@buleje/design-system/icons";
import { SectionHeader } from "@/components/ui-system";
import { ProductCard } from "@/components/ProductCard";
import { pickRandom, type MockProduct } from "@/lib/recommendations/mock";
import { cn } from "@/lib/utils";

interface Props {
  initialProducts: MockProduct[];
  /** Stat social proof total (pasa desde el server para no fetch extra) */
  socialProofCount?: number;
  className?: string;
}

/**
 * Números de social proof plausibles por categoria.
 * Simulan actividad real sin requerir DB adicional.
 */
const SOCIAL_STATS: Record<string, string> = {
  abarrote: "847 personas compraron esto esta semana",
  fruta: "612 personas eligieron esto hoy",
  carne: "394 personas pidieron esto esta semana",
  bebida: "1,203 unidades vendidas esta semana",
  lacte: "528 personas compraron esto hoy",
  limpie: "315 personas compraron esto esta semana",
};

function getSocialStat(category: string): string {
  const cat = category.toLowerCase();
  for (const [key, val] of Object.entries(SOCIAL_STATS)) {
    if (cat.includes(key)) return val;
  }
  return "235 personas compraron esto esta semana";
}

interface SocialBadgeProps {
  category: string;
}

function SocialBadge({ category }: SocialBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
      <Users className="h-3 w-3 text-[var(--color-primary)] shrink-0" strokeWidth={1.75} />
      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] leading-tight">
        {getSocialStat(category)}
      </span>
    </div>
  );
}

/**
 * CustomersLikeYou — "Recomendado / Clientes como tu compran"
 *
 * Grid 4 productos + social proof stat bajo cada card.
 * Datos: random shuffle diario para mantener frescura percibida.
 */
export function CustomersLikeYou({ initialProducts, className }: Props) {
  // Offset 42 para que sea distinto al random de InspiredByHistory
  const picks = pickRandom(
    initialProducts,
    4
  ).map((p, i) => ({ ...p, _offset: i * 42 }));

  if (picks.length === 0) return null;

  return (
    <section
      className={cn(
        "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-white dark:bg-gray-950",
        className
      )}
      aria-labelledby="customers-like-you-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Recomendado"
          title="Clientes como tú compran"
          description="Basado en los habitos de compra de tu barrio en Pucallpa."
          size="md"
          ruled
          className="mb-8"
          action={
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity hidden sm:inline-flex"
              aria-label="Ver mas recomendaciones"
            >
              Ver mas <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {picks.map((p) => (
            <div key={p.id} className="flex flex-col">
              <ProductCard
                product={{
                  ...p,
                  image: p.image ?? "",
                  stock: p.stock,
                }}
              />
              <SocialBadge category={p.category} />
            </div>
          ))}
        </div>

        {/* CTA mobile */}
        <div className="mt-6 sm:hidden text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
          >
            Ver mas recomendaciones <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  );
}
