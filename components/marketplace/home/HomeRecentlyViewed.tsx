"use client";

import Link from "next/link";
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import { useRecentViewed } from "@/hooks/use-recent-viewed";

/**
 * HomeRecentlyViewed — "Visto recientemente" en la home (Brandon 2026-06-08).
 * Ayuda al usuario a RETOMAR lo que estaba mirando (engagement + conversión).
 * Data REAL per-usuario (localStorage marketplace:recent-viewed:v1, guarda el
 * producto completo → sin fetch). Self-hide si no vio nada. Coherente con el
 * resto: SectionHeading + carrusel.
 */

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `hace ${min < 1 ? 1 : min} min`;
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(diff / 86_400_000);
  return `hace ${days} d`;
}

export default function HomeRecentlyViewed() {
  const { items, count, clear } = useRecentViewed();

  if (count === 0) return null;

  return (
    <section
      aria-label="Visto recientemente"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
    >
      <SectionHeading
        eyebrow="Tu actividad"
        title="Visto recientemente"
        action={
          <button
            type="button"
            onClick={clear}
            className="shrink-0 inline-flex items-center h-9 px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
          >
            Limpiar
          </button>
        }
      />

      <HorizontalCarousel ariaLabel="Visto recientemente">
        {items.map((item) => (
          <Link
            key={`${item.storeSlug}-${item.productId}`}
            href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
            className="group/card block overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--accent)]/50"
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
                  <Package
                    className="h-10 w-10 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
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
