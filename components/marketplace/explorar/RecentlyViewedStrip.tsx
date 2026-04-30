"use client";

import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import ExplorarSectionHeader from "./ExplorarSectionHeader";

/**
 * RecentlyViewedSectionBox — wrapper que SOLO renderiza el SectionBox si
 * hay items recientes. Visual QA P1 fix 2026-04-30: antes el SectionBox
 * externo en ExplorarClient se renderizaba siempre (caja vacía visible
 * brevemente cuando localStorage estaba vacío).
 *
 * Ahora se exporta este wrapper que se auto-oculta cuando no hay datos.
 */
export function RecentlyViewedSectionBox() {
  const { count } = useRecentViewed();
  if (count === 0) return null;

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
        "sm:[&_section]:!px-5 [&_section]:!py-4 sm:[&_section]:!py-5",
      ].join(" ")}
    >
      <RecentlyViewedStrip />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `hace ${min < 1 ? 1 : min} min`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(diff / 86_400_000);
  return `hace ${days} d`;
}

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

// ── Componente ────────────────────────────────────────────────────────────────

export default function RecentlyViewedStrip() {
  const { items, count, clear } = useRecentViewed();

  if (count === 0) return null;

  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* ExplorarSectionHeader ya tiene el border-b + mb-6 internamente.
          Pasamos el boton "Limpiar" como ctaLabel no aplica (es accion, no link),
          por eso usamos el slot header + boton aparte en el mismo flex row via
          un wrapper que superpone el boton en absoluto al borde derecho. */}
      <div className="relative">
        <ExplorarSectionHeader
          kicker="Tu actividad"
          title="Visto recientemente"
          subtitle="Productos que viste estos dias"
        />
        <button
          type="button"
          onClick={clear}
          className="hidden sm:inline-flex items-center absolute top-0 right-0 text-sm font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors whitespace-nowrap"
        >
          Limpiar historial
        </button>
      </div>

      <HorizontalCarousel ariaLabel="Visto recientemente">
        {items.map((item) => (
          <Link
            key={`${item.storeSlug}-${item.productId}`}
            href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
            className="group/card block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0"
          >
            <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="240px"
                  className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Package className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
                </span>
              )}
            </div>
            <div className="p-4 flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                {item.name}
              </p>
              <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                {pen.format(item.price)}
              </p>
              <p className="text-xs font-semibold text-[var(--text-tertiary)]">
                {relativeTime(item.viewedAt)}
              </p>
            </div>
          </Link>
        ))}
      </HorizontalCarousel>
    </section>
  );
}
