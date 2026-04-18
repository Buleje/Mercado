"use client";

/**
 * QuickActionsGrid — 4 cards de acciones rapidas del dashboard.
 *
 * Acciones: reordenar, seguimiento, canjear cupon, compra 1-click.
 * Cada card lleva IconBadge + titulo + descripcion + CTA.
 */

import Link from "next/link";
import { memo } from "react";
import { CardTitle, Caption, IconBadge, Kicker, SectionTitle } from "@buleje/design-system";
import {
  Repeat,
  Truck,
  Tag,
  Zap,
  ArrowRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { CustomerDashboardData } from "@/lib/customer-dashboard.mock";
import { cn } from "@/lib/utils";

export interface QuickActionsGridProps {
  data: CustomerDashboardData;
}

type QuickAction = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  accent?: boolean;
};

export const QuickActionsGrid = memo(function QuickActionsGrid({
  data,
}: QuickActionsGridProps) {
  const activeOrder = data.orders.active;
  const hasActive = activeOrder !== null;

  const actions: QuickAction[] = [
    {
      id: "reorder",
      icon: Repeat,
      title: "Reordenar ultimo pedido",
      description: "Misma canasta en 1 tap",
      href: "/cuenta/pedidos",
    },
    {
      id: "tracking",
      icon: Truck,
      title: hasActive ? "Segui tu pedido" : "Sin pedidos activos",
      description: hasActive
        ? `${activeOrder?.storeName ?? "En camino"} - ${activeOrder?.deliveryWindow ?? "pronto"}`
        : "Hace tu proximo pedido",
      href: hasActive ? `/cuenta/pedidos` : "/tienda",
      accent: hasActive,
    },
    {
      id: "redeem",
      icon: Tag,
      title: "Canjear cupon",
      description:
        data.coupons.disponiblesCount > 0
          ? `${data.coupons.disponiblesCount} disponibles`
          : "Explora promociones vigentes",
      href: "/cuenta/cupones",
    },
    {
      id: "one-click",
      icon: Zap,
      title: "Compra con 1 click",
      description: "Con tu direccion y Yape guardados",
      href: "/tienda",
    },
  ];

  return (
    <section aria-labelledby="quick-actions-heading">
      <div className="mb-4">
        <Kicker>Acciones rapidas</Kicker>
        <SectionTitle id="quick-actions-heading" className="mt-0.5">
          Tus atajos de siempre
        </SectionTitle>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map((action) => (
          <QuickActionCard key={action.id} action={action} />
        ))}
      </div>
    </section>
  );
});

function QuickActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  return (
    <Link
      href={action.href}
      className={cn(
        "group rounded-xl border p-4 flex flex-col gap-3 transition-colors",
        action.accent
          ? "border-[color-mix(in_oklch,var(--accent)_30%,transparent)] bg-[color-mix(in_oklch,var(--accent)_6%,var(--surface-raised))]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <IconBadge
          size="md"
          shape="square"
          intent={action.accent ? "primary" : "muted"}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </IconBadge>
        <ArrowRight
          className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] group-hover:translate-x-0.5 transition-all"
          aria-hidden
        />
      </div>
      <div>
        <CardTitle className="leading-tight">{action.title}</CardTitle>
        <Caption className="block mt-1 text-[var(--text-secondary)] leading-snug">
          {action.description}
        </Caption>
      </div>
    </Link>
  );
}

export default QuickActionsGrid;
