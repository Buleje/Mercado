"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { EnVivoHero } from "@/components/marketplace/en-vivo/EnVivoHero";
import { LivePlayer } from "@/components/marketplace/en-vivo/LivePlayer";
import { LiveChat } from "@/components/marketplace/en-vivo/LiveChat";
import { FeaturedProductsInLive } from "@/components/marketplace/en-vivo/FeaturedProductsInLive";
import { UpcomingLives } from "@/components/marketplace/en-vivo/UpcomingLives";
import { PastLives } from "@/components/marketplace/en-vivo/PastLives";
import { LiveCategoryChips } from "@/components/marketplace/en-vivo/LiveCategoryChips";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";
import {
  getLiveCategories,
  getLiveNow,
  getPastLives,
  getUpcomingLives,
  LIVES_MOCK,
} from "@/lib/mocks/lives.mock";

export function EnVivoClient() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const currentLive = useMemo(() => getLiveNow(), []);
  const upcoming = useMemo(() => getUpcomingLives(), []);
  const past = useMemo(() => getPastLives(), []);
  const categories = useMemo(() => getLiveCategories(), []);

  // nextInHours se calcula una sola vez vía useState initializer para no
  // llamar Date.now() durante el render body (regla de pureza de React 19).
  const [nextInHours] = useState<number | undefined>(() => {
    if (upcoming.length === 0) return undefined;
    const diffMs = new Date(upcoming[0].startsAt).getTime() - Date.now();
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  });

  const filteredUpcoming = useMemo(
    () => (activeCategory ? upcoming.filter((l) => l.category === activeCategory) : upcoming),
    [upcoming, activeCategory],
  );
  const filteredPast = useMemo(
    () => (activeCategory ? past.filter((l) => l.category === activeCategory) : past),
    [past, activeCategory],
  );

  const liveCount = LIVES_MOCK.filter((l) => l.status === "live").length;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
          <Breadcrumbs
            items={[
              { label: "Marketplace", href: "/marketplace" },
              { label: "En Vivo" },
            ]}
          />
        </div>
      </div>

      <EnVivoHero liveCount={liveCount} nextInHours={nextInHours} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12 space-y-12 sm:space-y-16">
        {/* ── Transmisión en vivo ahora ── */}
        {currentLive && (
          <section aria-labelledby="live-now-title" className="space-y-5">
            <header className="flex items-center justify-between flex-wrap gap-3">
              <h2
                id="live-now-title"
                className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold text-[var(--text-primary)]"
              >
                Transmitiendo ahora
              </h2>

              <Link
                href={`/marketplace/en-vivo/${currentLive.id}`}
                className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--accent)] hover:underline"
              >
                Ver pantalla completa
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
                <Link
                  href={`/marketplace/en-vivo/${currentLive.id}`}
                  aria-label="Abrir transmisión en vivo"
                  className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <LivePlayer live={currentLive} />
                </Link>

                <div className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-5">
                  <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                    {currentLive.description}
                  </p>
                </div>
              </div>

              <aside className="space-y-4">
                <FeaturedProductsInLive products={currentLive.products} compact />
                <LiveChat
                  initialMessages={currentLive.chat}
                  hostName={currentLive.storeName}
                  active
                />
              </aside>
            </div>
          </section>
        )}

        {/* ── Category chips ── */}
        {categories.length > 0 && (
          <section className="space-y-4" aria-labelledby="categories-title">
            <h2
              id="categories-title"
              className="text-[length:var(--ts-lg)] font-semibold text-[var(--text-primary)]"
            >
              Categorías en vivo
            </h2>
            <LiveCategoryChips
              categories={categories}
              active={activeCategory}
              onChange={setActiveCategory}
            />
          </section>
        )}

        {/* ── Upcoming ── */}
        <UpcomingLives lives={filteredUpcoming} />

        {/* ── Past ── */}
        <PastLives lives={filteredPast} />
      </main>

      <RelatedFeatures features={relatedFor("en-vivo")} />
    </div>
  );
}
