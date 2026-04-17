"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Store as StoreIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
          "items-center justify-center shadow-lg",
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
          "items-center justify-center shadow-lg",
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
                "group shrink-0 basis-[48%] sm:basis-[32%] lg:basis-[18%]",
                "bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700",
                "p-4 text-center transition-all hover-lift hover:border-primary/40",
              )}
            >
              <div className="relative w-16 h-16 mx-auto mb-3 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group-hover:scale-105 transition-transform duration-300">
                {store.logo ? (
                  <Image
                    src={store.logo}
                    alt={store.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary">
                    <StoreIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {store.name}
              </h3>
              {store.rating > 0 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                    {store.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({store.reviewCount})
                  </span>
                </div>
              )}
              {store.zone && (
                <p className="text-xs text-gray-400 mt-1 capitalize truncate">
                  {store.zone.replace(/-/g, " ")}
                </p>
              )}
              {store.products && store.products.length > 0 && (
                <div className="flex items-center justify-center mt-2">
                  {store.products.slice(0, 4).map((sp, i) => (
                    <div
                      key={i}
                      className="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0 border-2 border-white dark:border-gray-800"
                      style={{ marginLeft: i > 0 ? "-6px" : "0" }}
                      title={sp.product.name}
                    >
                      {sp.product.image ? (
                        <Image
                          src={sp.product.image}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 object-cover"
                        />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
