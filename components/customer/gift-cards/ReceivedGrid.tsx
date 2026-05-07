"use client";

import { useState } from "react";
import { Copy, Check, ShoppingBag, Clock, User } from "@buleje/design-system/icons";
import type { MockGiftCard } from "@/lib/mocks/gift-cards.mock";
import { GIFT_CARD_DESIGNS } from "@/lib/mocks/gift-cards.mock";
import GiftCardArtwork from "@/components/marketplace/gift-cards/shared/GiftCardArtwork";
import GiftCardEmpty from "./GiftCardEmpty";

type Props = {
  cards: MockGiftCard[];
};

function designLabel(id: MockGiftCard["design"]): string {
  return GIFT_CARD_DESIGNS.find((d) => d.id === id)?.label ?? id;
}

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

export default function ReceivedGrid({ cards }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <GiftCardEmpty
        title="Aun no te regalaron ninguna tarjeta"
        description="Cuando alguien te envie una, la vas a ver aca y podras canjearla con un click."
        ctaLabel="Explorar gift cards"
      />
    );
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => {
        const isActive = card.status === "activa" && card.balance > 0;
        const progress = card.amount > 0 ? (card.balance / card.amount) * 100 : 0;

        return (
          <article
            key={card.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="aspect-[16/9]">
              <GiftCardArtwork design={card.design} className="h-full w-full" />
            </div>

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {designLabel(card.design)} · {fmtDate(card.createdAt)}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">S/</span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {Number(card.balance).toFixed(2)}
                    </span>
                    {card.balance !== card.amount && (
                      <span className="ml-1 text-xs text-gray-400 line-through dark:text-gray-500">
                        S/ {Number(card.amount).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={card.status} balance={card.balance} />
              </div>

              {isActive && (
                <div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full bg-gray-900 dark:bg-white"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400">
                    {progress.toFixed(0)}% del saldo disponible
                  </p>
                </div>
              )}

              {card.message && (
                <blockquote className="rounded-lg border-l-2 border-gray-300 bg-gray-50 px-3 py-2 text-sm italic text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  &ldquo;{card.message}&rdquo;
                </blockquote>
              )}

              <dl className="space-y-1 text-xs">
                <Row label="De" value={card.senderName} icon={User} />
                <Row
                  label="Canjeada"
                  value={card.redeemedAt ? fmtDate(card.redeemedAt) : "Pendiente"}
                  icon={Clock}
                />
              </dl>

              <div className="mt-auto flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => copyCode(card.code)}
                  className="inline-flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {copied === card.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {card.code}
                    </>
                  )}
                </button>
                {isActive && (
                  <button
                    type="button"
                    className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                    Usar
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
  balance,
}: {
  status: MockGiftCard["status"];
  balance: number;
}) {
  const isUsable = status === "activa" && balance > 0;
  const labels: Record<MockGiftCard["status"], string> = {
    activa: balance > 0 ? "Activa" : "Sin saldo",
    canjeada: "Canjeada",
    expirada: "Expirada",
  };
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide",
        isUsable
          ? "bg-emerald-50 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-300"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      ].join(" ")}
    >
      {labels[status]}
    </span>
  );
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="truncate font-medium text-gray-700 dark:text-gray-300">{value}</dd>
    </div>
  );
}
