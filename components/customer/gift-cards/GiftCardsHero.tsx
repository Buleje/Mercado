"use client";

import Link from "next/link";
import { Plus } from "@buleje/design-system/icons";
import { MiniHero } from "@/components/customer/MiniHero";
import { GiftCardIlustrada } from "@/components/ui-system/illustrations";

type Props = {
  totalBalance: number;
  activeCount: number;
};

export default function GiftCardsHero({ totalBalance, activeCount }: Props) {
  const stats =
    activeCount > 0
      ? [
          {
            label: activeCount === 1 ? "activa" : "activas",
            value: activeCount,
          },
          { label: "disponible", value: `S/ ${totalBalance.toFixed(2)}` },
        ]
      : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-6">
      <MiniHero
        kicker="Mis tarjetas de regalo"
        title="Tarjetas de regalo Buleje"
        description={
          activeCount > 0
            ? "Revisa tu saldo, reenviá invitaciones o regalá una nueva tarjeta."
            : "Todavía no tienes tarjetas. Regalá una o canjeá la que te mandaron."
        }
        illustration={<GiftCardIlustrada size={160} />}
        stats={stats}
        action={
          <Link
            href="/marketplace/gift-cards"
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Regalar una tarjeta
          </Link>
        }
      />
    </div>
  );
}
