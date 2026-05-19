"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BodegaAbriendo, MotoRuta } from "@/components/ui-system/illustrations/contextual";
import { DoniaElena, CuadernoFiadoReal } from "@/components/ui-system/illustrations/pucallpa-locals";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";

/** Rotacion deterministica de ilustraciones para featured stores sin logo. */
function FeaturedIllustration({ id, className }: { id: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const pick = Math.abs(hash) % 5;
  const common = { size: 120, strokeWidth: 1.5, className } as const;
  if (pick === 0) return <BodegaAbriendo {...common} />;
  if (pick === 1) return <DoniaElena {...common} />;
  if (pick === 2) return <CuadernoFiadoReal {...common} />;
  if (pick === 3) return <BodegueroCelebrando {...common} />;
  return <MotoRuta {...common} />;
}

export interface FeaturedStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  products?: { product: { name: string; image: string | null } }[];
}

interface Props {
  stores: FeaturedStore[];
}

export default function FeaturedStoresCarousel({ stores }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps",
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();

  if (stores.length === 0) return null;

  return (
    <div className="relative">
      {/* Navigation buttons — desktop only */}
      <button
        type="button"
        aria-label="Anterior"
        onClick={scrollPrev}
        disabled={!canPrev}
        className={cn(
          "hidden md:flex absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10",
          "h-11 w-11 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "items-center justify-center shadow-[var(--shadow-md)]",
          "transition-all hover:scale-105",
          "disabled:opacity-0 disabled:pointer-events-none",
        )}
      >
        <ChevronLeft className="h-5 w-5 text-gray-700 dark:text-gray-200" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={scrollNext}
        disabled={!canNext}
        className={cn(
          "hidden md:flex absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-10",
          "h-11 w-11 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          "items-center justify-center shadow-[var(--shadow-md)]",
          "transition-all hover:scale-105",
          "disabled:opacity-0 disabled:pointer-events-none",
        )}
      >
        <ChevronRight className="h-5 w-5 text-gray-700 dark:text-gray-200" />
      </button>

      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex gap-4 pr-4">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/marketplace/${store.slug}`}
              className={cn(
                "group shrink-0 basis-[72%] sm:basis-[46%] lg:basis-[22%]",
                "bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)]",
                "overflow-hidden transition-all hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
              )}
            >
              {/* Illustration / logo area grande */}
              <div className="relative aspect-[4/3] w-full bg-[var(--surface-sunken)] flex items-center justify-center">
                {store.logo ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-base)]">
                    <Image
                      src={store.logo}
                      alt={store.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                ) : (
                  <FeaturedIllustration
                    id={store.id}
                    className="text-[var(--text-tertiary)] opacity-70 group-hover:opacity-85 transition-opacity"
                  />
                )}
              </div>

              {/* Info content */}
              <div className="p-4">
                {/* Kicker mini teal "BODEGA DESTACADA" + separador */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                    Bodega destacada
                  </span>
                  <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                </div>

                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {store.name}
                </h3>

                <div className="flex items-center gap-2 mt-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {store.rating > 0 && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Star className="h-3 w-3 fill-current text-[var(--accent)]" />
                      {Number(store.rating).toFixed(1)}
                      <span className="opacity-70">({store.reviewCount})</span>
                    </span>
                  )}
                  {store.zone && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="capitalize truncate">
                        {store.zone.replace(/-/g, " ")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
