"use client";

import { Clock, CheckCircle2, Send, User, MessageCircle, Mail } from "@buleje/design-system/icons";
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

export default function SentGrid({ cards }: Props) {
  if (cards.length === 0) {
    return (
      <GiftCardEmpty
        title="Todavia no enviaste tarjetas"
        description="Regala una tarjeta a un familiar o vecino. Llega al instante por WhatsApp o email."
        ctaLabel="Regalar una tarjeta"
        variant="sent"
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => {
        const isPending = !card.redeemedAt;

        return (
          <article
            key={card.id}
            className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="aspect-[16/10] w-32 shrink-0 overflow-hidden rounded-xl">
              <GiftCardArtwork design={card.design} className="h-full w-full" />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {designLabel(card.design)} · {fmtDate(card.createdAt)}
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white">
                    S/ {card.amount.toFixed(2)}
                  </div>
                </div>
                {isPending ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold uppercase text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-300">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Pendiente
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold uppercase text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Canjeada
                  </span>
                )}
              </div>

              <dl className="space-y-1 text-xs">
                <Row label="Para" value={card.recipientName} icon={User} />
                <Row
                  label={card.contactMethod === "whatsapp" ? "WhatsApp" : "Email"}
                  value={card.recipientContact}
                  icon={card.contactMethod === "whatsapp" ? MessageCircle : Mail}
                />
              </dl>

              <div className="mt-auto flex items-center justify-between pt-2 text-[length:var(--ts-2xs)]">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-white"
                  disabled={!isPending}
                  title={isPending ? "Reenviar" : "Ya fue canjeada"}
                >
                  <Send className="h-3 w-3" aria-hidden="true" />
                  Reenviar
                </button>
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {card.code}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
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
      <dt className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="truncate font-medium text-gray-700 dark:text-gray-300">{value}</dd>
    </div>
  );
}
