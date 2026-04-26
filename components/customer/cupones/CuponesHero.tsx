"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Percent, ShoppingBag } from "@buleje/design-system/icons";
import { MiniHero } from "@/components/customer/MiniHero";
import { CorazonLatiendo } from "@/components/ui-system/illustrations";

type Props = {
  activeCount: number;
  totalSavings: number;
};

export default function CuponesHero({ activeCount, totalSavings }: Props) {
  const pathname = usePathname();
  // Tienda individual: el CTA debe llevar al catálogo del comerciante,
  // NO al marketplace cross-vendor.
  const tenantSlug = pathname?.match(/^\/t\/([^/]+)/)?.[1] ?? null;
  const isTenantStore = !!tenantSlug;
  const ctaHref = isTenantStore ? `/t/${tenantSlug}/tienda` : "/marketplace";
  const ctaLabel = isTenantStore ? "Ir a la tienda" : "Ir al marketplace";
  const CtaIcon = isTenantStore ? ShoppingBag : Percent;

  const stats =
    activeCount > 0
      ? [
          {
            label: activeCount === 1 ? "activo" : "activos",
            value: activeCount,
          },
          {
            label: "en descuentos",
            value: `S/ ${totalSavings.toFixed(2)}`,
          },
        ]
      : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-6">
      <MiniHero
        kicker="Mis cupones"
        title="Tus cupones disponibles"
        description={
          activeCount > 0
            ? "Aplicalos en el checkout para ahorrar en tu próximo pedido."
            : "Todavía no tienes cupones activos. Aplicá uno nuevo abajo."
        }
        illustration={<CorazonLatiendo size={140} />}
        stats={stats}
        action={
          <Link
            href={ctaHref}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
          >
            <CtaIcon className="h-4 w-4" aria-hidden="true" />
            {ctaLabel}
          </Link>
        }
      />
    </div>
  );
}
