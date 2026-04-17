"use client";

import Link from "next/link";
import Image from "next/image";
import { Clock, X } from "lucide-react";
import { useRecentViewed } from "@/hooks/use-recent-viewed";

export default function MarketplaceRecentViewed() {
  const { items, clear } = useRecentViewed();

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Productos vistos recientemente"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Seguiste viendo
          </h3>
        </div>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-red-500"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {items.map((it) => (
          <Link
            key={`${it.storeSlug}-${it.productId}`}
            href={`/marketplace/${it.storeSlug}?p=${it.productId}`}
            className="shrink-0 w-36 group"
          >
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 group-hover:border-primary/40 transition-all">
              {it.image ? (
                <Image
                  src={it.image}
                  alt={it.name}
                  fill
                  sizes="144px"
                  className="object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-300">
                  <Clock className="h-8 w-8" />
                </div>
              )}
            </div>
            <p className="mt-2 text-xs font-bold text-gray-800 dark:text-gray-100 line-clamp-2 leading-tight">
              {it.name}
            </p>
            <p className="text-[11px] font-extrabold text-gray-900 dark:text-white mt-0.5">
              S/{it.price.toFixed(2)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
