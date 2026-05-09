"use client";

import Link from "next/link";
import { ShoppingBag, Store, Receipt } from "@buleje/design-system/icons";
import type { MockGiftCardUsage } from "@/lib/mocks/gift-cards.mock";
import GiftCardEmpty from "./GiftCardEmpty";

type Props = {
  usage: MockGiftCardUsage[];
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function UsageHistory({ usage }: Props) {
  if (usage.length === 0) {
    return (
      <GiftCardEmpty
        title="Todavia no usaste tarjetas"
        description="Cuando pagues con una gift card en el marketplace, vas a ver el historial aca."
        ctaLabel="Ir al marketplace"
        ctaHref="/marketplace"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {usage.map((u) => (
          <li
            key={u.id}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-alt)]/60 dark:hover:bg-gray-800/40"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            </span>

            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <Store className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                {u.storeName}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{fmtDate(u.createdAt)}</span>
                <span>·</span>
                {u.orderNumber ? (
                  <Link
                    href={`/mis-pedidos?pedido=${u.orderNumber}`}
                    className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white"
                  >
                    <Receipt className="h-3 w-3" aria-hidden="true" />
                    {u.orderNumber}
                  </Link>
                ) : (
                  <span>Sin pedido asociado</span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                — S/ {Number(u.amount).toFixed(2)}
              </div>
              <div className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                Resto: S/ {Number(u.balanceAfter).toFixed(2)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
