"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";
import { SectionHeader } from "@/components/ui-system";
import { BodegaAbriendo, MotoRuta } from "@/components/ui-system/illustrations/contextual";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";
import { cn } from "@/lib/utils";
import type { MockStore } from "@/lib/recommendations/mock";

interface Props {
  initialStores: MockStore[];
  className?: string;
}

/** Ilustracion determinista por id de tienda (igual que FeaturedStoresCarousel) */
function StoreIllustration({ id, className }: { id: string; className?: string }) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const pick = Math.abs(h) % 3;
  const common = { size: 80, strokeWidth: 1.5, className } as const;
  if (pick === 0) return <BodegaAbriendo {...common} />;
  if (pick === 1) return <DoniaElena {...common} />;
  return <MotoRuta {...common} />;
}

/**
 * NewInYourArea — "Nuevo en Pucallpa / Bodegas que acaban de abrir"
 *
 * Carousel manual (prev/next) + snap scroll.
 * Toma los ultimos N stores como "nuevas" (invertido del array que llega ordenado por rating).
 */
export function NewInYourArea({ initialStores, className }: Props) {
  // Las "nuevas" son las de menor rating/reviewCount — menos establecidas
  const newStores = [...initialStores].reverse().slice(0, 5);

  const [current, setCurrent] = useState(0);
  const total = newStores.length;

  const prev = useCallback(() => setCurrent((c) => (c - 1 + total) % total), [total]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);

  // Auto-advance cada 5s
  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [next, total]);

  if (newStores.length === 0) return null;

  return (
    <section
      className={cn(
        "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-white dark:bg-gray-950",
        className
      )}
      aria-labelledby="new-stores-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Nuevo en Pucallpa"
          title="Bodegas que acaban de abrir"
          description="Se el primero en descubrirlas y apoyar a los nuevos negocios de tu barrio."
          size="md"
          ruled
          className="mb-8"
        />

        {/* Carousel desktop: horizontal scroll + controles */}
        <div className="relative">
          {/* Controles */}
          {total > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 hidden sm:flex items-center justify-center h-9 w-9 rounded-full border border-[var(--rule-base)] bg-white dark:bg-gray-900 text-[var(--text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all shadow-sm"
                aria-label="Tienda anterior"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                onClick={next}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 hidden sm:flex items-center justify-center h-9 w-9 rounded-full border border-[var(--rule-base)] bg-white dark:bg-gray-900 text-[var(--text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all shadow-sm"
                aria-label="Tienda siguiente"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </>
          )}

          {/* Grid: mobile scroll / desktop visible */}
          <div
            className={cn(
              "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide",
              "sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0",
              "lg:grid-cols-4"
            )}
            role="list"
            aria-label="Bodegas nuevas en tu zona"
          >
            {newStores.map((store, i) => (
              <Link
                key={store.id}
                href={`/marketplace/${store.slug}`}
                role="listitem"
                className={cn(
                  "group shrink-0 w-[220px] sm:w-auto snap-start",
                  "flex flex-col rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-gray-900",
                  "hover:border-[var(--color-primary)]/30 hover:shadow-md transition-all duration-200",
                  // En desktop, resaltamos la activa del carousel
                  "sm:opacity-100"
                )}
                aria-current={i === current ? "true" : undefined}
              >
                {/* Imagen / Ilustracion */}
                <div className="relative h-32 rounded-t-2xl overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center">
                  {store.logo ? (
                    <Image
                      src={store.logo}
                      alt={store.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 220px, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <StoreIllustration
                      id={store.id}
                      className="text-[var(--text-tertiary)] opacity-60 group-hover:opacity-80 transition-opacity"
                    />
                  )}
                  {/* Badge "Nuevo" */}
                  <span className="absolute top-2 left-2 bg-[var(--color-primary)] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Nuevo
                  </span>
                </div>

                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <h3 className="font-bold text-sm text-[var(--text-primary)] leading-tight line-clamp-1 group-hover:text-[var(--color-primary)] transition-colors">
                    {store.name}
                  </h3>

                  {store.zone && (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                      <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                      {store.zone}
                    </span>
                  )}

                  {store.description && (
                    <p className="text-[10px] text-[var(--text-tertiary)] line-clamp-2 leading-relaxed">
                      {store.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between pt-2">
                    {store.reviewCount > 0 ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                        <Star className="h-3 w-3 fill-current" strokeWidth={1.5} />
                        {store.rating.toFixed(1)}
                        <span className="text-[var(--text-tertiary)]">
                          ({store.reviewCount})
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        Sin resenas aun
                      </span>
                    )}

                    <span className="text-[10px] font-semibold text-[var(--color-primary)] group-hover:underline">
                      Ser primero
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Dots de paginacion (solo visible en desktop cuando hay >1) */}
        {total > 1 && (
          <div className="hidden sm:flex items-center justify-center gap-1.5 mt-6" role="tablist" aria-label="Paginas del carousel">
            {newStores.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                role="tab"
                aria-selected={i === current}
                aria-label={`Tienda ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === current
                    ? "w-6 bg-[var(--color-primary)]"
                    : "w-1.5 bg-[var(--rule-base)] hover:bg-[var(--text-tertiary)]"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
