"use client";

/**
 * ActivityFeed — timeline con los ultimos 5 eventos de la cuenta.
 *
 * Cada item: IconBadge + titulo + detalle + timestamp relativo + link a detalle.
 */

import { memo } from "react";
import Link from "next/link";
import {
  Kicker,
  SectionTitle,
  CardTitle,
  Caption,
  IconBadge,
  EmptyState,
} from "@buleje/design-system";
import {
  Package,
  Truck,
  CheckCircle2,
  Tag,
  CalendarClock,
  Gift,
  PiggyBank,
  Heart,
  Clock,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type {
  CustomerDashboardData,
  ActivityEventKind,
} from "@/lib/customer-dashboard.mock";
import { relativeFromNow } from "@/lib/customer-dashboard.mock";
import { cn } from "@/lib/utils";

export interface ActivityFeedProps {
  data: CustomerDashboardData;
}

const EVENT_ICON: Record<ActivityEventKind, LucideIcon> = {
  order_confirmed: Package,
  order_delivered: CheckCircle2,
  order_shipped: Truck,
  coupon_new: Tag,
  subscription_upcoming: CalendarClock,
  gift_received: Gift,
  socio_cashback: PiggyBank,
  favorite_back_in_stock: Heart,
};

const EVENT_INTENT: Partial<Record<ActivityEventKind, "primary" | "muted" | "success" | "warning">> = {
  order_shipped: "primary",
  order_delivered: "success",
  coupon_new: "primary",
  socio_cashback: "success",
  gift_received: "warning",
};

export const ActivityFeed = memo(function ActivityFeed({ data }: ActivityFeedProps) {
  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-4">
        <Kicker>Actividad reciente</Kicker>
        <SectionTitle id="activity-heading" className="mt-0.5">
          Lo último en tu cuenta
        </SectionTitle>
      </div>
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        {data.activity.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin actividad aun"
            description="Hace tu primer pedido y veras aqui tu historial."
            action={{
              label: "Explorar tienda",
              node: (
                <Link
                  href="/tienda"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[length:var(--ts-xs)] font-semibold bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90"
                >
                  Explorar tienda
                </Link>
              ),
            }}
          />
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {data.activity.slice(0, 5).map((event) => {
              const Icon = EVENT_ICON[event.kind] ?? Clock;
              const intent = EVENT_INTENT[event.kind] ?? "muted";
              return (
                <li key={event.id}>
                  <Link
                    href={event.href}
                    className={cn(
                      "group flex items-start gap-3 p-4 transition-colors",
                      "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <IconBadge size="md" shape="square" intent={intent}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </IconBadge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="leading-tight truncate">
                          {event.title}
                        </CardTitle>
                        <Caption className="shrink-0 text-[var(--text-tertiary)]">
                          {relativeFromNow(event.timestamp)}
                        </Caption>
                      </div>
                      <Caption className="block mt-1 text-[var(--text-secondary)] leading-snug">
                        {event.detail}
                      </Caption>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
});

export default ActivityFeed;
