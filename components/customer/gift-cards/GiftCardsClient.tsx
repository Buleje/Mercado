"use client";

import { useMemo, useState } from "react";
import { Inbox, Send, History } from "@buleje/design-system/icons";
import type { MockGiftCard, MockGiftCardUsage } from "@/lib/mocks/gift-cards.mock";
import GiftCardsHero from "./GiftCardsHero";
import ReceivedGrid from "./ReceivedGrid";
import SentGrid from "./SentGrid";
import UsageHistory from "./UsageHistory";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

type TabId = "recibidas" | "enviadas" | "historial";

type Props = {
  received: MockGiftCard[];
  sent: MockGiftCard[];
  usage: MockGiftCardUsage[];
};

export default function GiftCardsClient({ received, sent, usage }: Props) {
  const [tab, setTab] = useState<TabId>("recibidas");

  const summary = useMemo(() => {
    const active = received.filter((c) => c.status === "activa" && c.balance > 0);
    const total = active.reduce((acc, c) => acc + c.balance, 0);
    return { total, activeCount: active.length };
  }, [received]);

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { id: "recibidas", label: "Recibidas", icon: Inbox, count: received.length },
    { id: "enviadas", label: "Enviadas", icon: Send, count: sent.length },
    { id: "historial", label: "Historial", icon: History, count: usage.length },
  ];

  return (
    <main className="min-h-screen bg-gray-50/60 dark:bg-gray-950">
      <div className="border-b border-[var(--rule-muted)] bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs
            items={[
              { label: "Mi cuenta", href: "/cuenta" },
              { label: "Gift Cards" },
            ]}
          />
        </div>
      </div>

      <GiftCardsHero totalBalance={summary.total} activeCount={summary.activeCount} />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Vistas de gift cards"
          className="sticky top-16 z-10 -mx-4 border-b border-gray-100 bg-gray-50/80 px-4 backdrop-blur sm:mx-0 sm:px-0 dark:border-gray-800 dark:bg-gray-950/80"
        >
          <div className="flex gap-1 overflow-x-auto py-3">
            {tabs.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={isActive}
                  className={[
                    "inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  <t.icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                  <span
                    className={[
                      "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      isActive
                        ? "bg-white/20 text-white dark:bg-gray-900/30 dark:text-gray-900"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                    ].join(" ")}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <section className="py-8">
          {tab === "recibidas" && <ReceivedGrid cards={received} />}
          {tab === "enviadas" && <SentGrid cards={sent} />}
          {tab === "historial" && <UsageHistory usage={usage} />}
        </section>
      </div>

      <RelatedFeatures features={relatedFor("gift-cards")} />
    </main>
  );
}
