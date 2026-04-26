"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { ProductCardSkeleton } from "@/components/LoadingSkeleton";

/**
 * Client-side wrapper for CategoryCatalog.
 * `ssr: false` is only allowed in Client Components (Next.js 16+).
 */

function CategoryCatalogLoading() {
  return (
    <section className="py-12 sm:py-16 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Title skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
            <div className="h-4 w-32 bg-gray-200 dark:bg-surface rounded-full animate-pulse" />
          </div>
          <div className="h-5 w-36 bg-gray-200 dark:bg-surface rounded-full animate-pulse" />
        </div>
        {/* Category bubbles skeleton */}
        <div className="flex gap-2 mb-6 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-24 shrink-0 bg-gray-200 dark:bg-surface rounded-full animate-pulse" />
          ))}
        </div>
        {/* Search/Sort bar skeleton */}
        <div className="flex gap-3 mb-8">
          <div className="h-12 flex-1 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
          <div className="h-12 w-32 bg-gray-200 dark:bg-surface rounded-xl animate-pulse" />
        </div>
        {/* Product grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

const CategoryCatalog = dynamic(
  () =>
    import("@/components/CategoryCatalog") as Promise<{
      default: ComponentType<{
        categoryId: string;
        categoryLabel: string;
        categoryEmoji: string;
      }>;
    }>,
  { loading: CategoryCatalogLoading }
);

export default function CategoryCatalogClient(props: {
  categoryId: string;
  categoryLabel: string;
  categoryEmoji: string;
}) {
  return <CategoryCatalog {...props} />;
}
