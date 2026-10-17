"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, PageTitle } from "@buleje/design-system";
import { ArrowRight, Radio } from "@buleje/design-system/icons";
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
import { useLivesEnVivo } from "./use-lives-en-vivo";

/**
 * Hub /marketplace/en-vivo — SOLO transmisiones reales (live_sessions).
 * Sin ninguna: cabecera sobria + estado vacío honesto (09-10: antes arrancaba
 * con lives de ejemplo y los dejaba si la API venía vacía).
 */
export function EnVivoClient() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { cargando, error, enVivo, proximas, pasadas, proximaEnHoras } = useLivesEnVivo();
  const currentLive = enVivo[0] ?? null;

  const categories = useMemo(
    () => Array.from(new Set([...enVivo, ...proximas, ...pasadas].map((l) => l.category).filter(Boolean))),
    [enVivo, proximas, pasadas],
  );
  const filteredUpcoming = useMemo(
    () => (activeCategory ? proximas.filter((l) => l.category === activeCategory) : proximas),
    [proximas, activeCategory],
  );
  const filteredPast = useMemo(
    () => (activeCategory ? pasadas.filter((l) => l.category === activeCategory) : pasadas),
    [pasadas, activeCategory],
  );

  // El hero grande promete «en vivo ahora» o «la próxima en N h»: solo se usa
  // cuando hay con qué cumplirlo.
  const hayPromesa = enVivo.length > 0 || proximas.length > 0;
  const sinNada = !cargando && enVivo.length === 0 && proximas.length === 0 && pasadas.length === 0;

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

      {hayPromesa ? (
        <EnVivoHero liveCount={enVivo.length} nextInHours={proximaEnHoras} />
      ) : (
        <header className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-12">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent-dark)] dark:text-[var(--accent)]">
            <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Buleje · En vivo
          </p>
          <PageTitle className="mt-2 text-[var(--text-primary)]">Transmisiones de las tiendas</PageTitle>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12 space-y-12 sm:space-y-16">
        {cargando && (
          <p role="status" className="text-base text-[var(--text-secondary)]">
            Buscando transmisiones…
          </p>
        )}

        {error && (
          <p role="alert" className="text-base text-[var(--data-error)]">
            No pudimos revisar las transmisiones. Volvemos a intentar en 30 segundos.
          </p>
        )}

        {sinNada && !error && (
          <EmptyState
            icon={Radio}
            title="Ninguna tienda está transmitiendo ahora"
            description="Cuando una bodega salga en vivo o programe una transmisión, aparece aquí."
            action={{
              label: "Ver tiendas",
              node: (
                <Link
                  href="/marketplace/negocios"
                  className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-[var(--accent)] text-white text-base font-semibold hover:bg-[var(--accent-600)]"
                >
                  Ver tiendas
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ),
            }}
          />
        )}

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

                {currentLive.description && (
                  <div className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-5">
                    <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
                      {currentLive.description}
                    </p>
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <FeaturedProductsInLive products={currentLive.products} compact />
                <LiveChat
                  initialMessages={currentLive.chat}
                  hostName={currentLive.storeName}
                  liveId={currentLive.id}
                  active
                />
              </aside>
            </div>
          </section>
        )}

        {/* ── Category chips (solo de lives reales) ── */}
        {categories.length > 1 && (
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

        <UpcomingLives lives={filteredUpcoming} />
        <PastLives lives={filteredPast} />
      </main>

      <RelatedFeatures features={relatedFor("en-vivo")} />

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}
    </div>
  );
}
