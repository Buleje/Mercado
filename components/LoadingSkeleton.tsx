/**
 * Reusable loading skeleton components for a consistent loading experience
 * across the application. Used while dynamic components are loading.
 */

import { cn } from "@/lib/utils";

// ── Base Skeleton ─────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-gray-200 dark:bg-surface",
        className
      )}
    />
  );
}

// ── Product Card Skeleton ─────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden">
      {/* Image */}
      <Skeleton className="aspect-square w-full" />
      
      {/* Body */}
      <div className="p-3 sm:p-4 space-y-3">
        {/* Title */}
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        
        {/* Price */}
        <div className="flex items-end justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Product Grid Skeleton ─────────────────────────────────────────────────────

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Section Skeleton ──────────────────────────────────────────────────────────

export function SectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
      </div>
      
      {/* Content */}
      <ProductGridSkeleton count={4} />
    </div>
  );
}

// ── Category Section Skeleton ─────────────────────────────────────────────────

export function CategorySectionSkeleton() {
  return (
    <div className="rounded-2xl p-5 sm:p-6 bg-white dark:bg-card border border-gray-100 dark:border-card-border">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      
      {/* Products */}
      <ProductGridSkeleton count={4} />
    </div>
  );
}

// ── Text Block Skeleton ───────────────────────────────────────────────────────

export function TextBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

// ── Card Skeleton ─────────────────────────────────────────────────────────────

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 space-y-4">
      <Skeleton className="h-6 w-1/3" />
      <TextBlockSkeleton lines={3} />
    </div>
  );
}

// ── Hero Skeleton ─────────────────────────────────────────────────────────────

export function HeroSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 to-gray-800 p-4">
      <div className="text-center space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-48 mx-auto rounded-full" />
        <Skeleton className="h-16 w-full max-w-2xl mx-auto" />
        <Skeleton className="h-16 w-3/4 max-w-xl mx-auto" />
        <Skeleton className="h-6 w-full max-w-lg mx-auto" />
        
        <div className="flex gap-4 justify-center pt-4">
          <Skeleton className="h-14 w-48 rounded-2xl" />
          <Skeleton className="h-14 w-52 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ── Stats Skeleton ────────────────────────────────────────────────────────────

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="text-center space-y-2">
          <Skeleton className="h-12 w-24 mx-auto" />
          <Skeleton className="h-4 w-20 mx-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Testimonial Skeleton ──────────────────────────────────────────────────────

export function TestimonialSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <TextBlockSkeleton lines={4} />
    </div>
  );
}

// ── FAQ Skeleton ──────────────────────────────────────────────────────────────

export function FAQSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-5"
        >
          <Skeleton className="h-5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ── Full Page Loading ─────────────────────────────────────────────────────────

export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-white dark:bg-card border-b border-gray-100 dark:border-card-border">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-8">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  );
}
