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
        "rounded-lg shimmer",
        className
      )}
    />
  );
}

// ── Product Card Skeleton ─────────────────────────────────────────────────────
// Matches exact dimensions of ProductCard to prevent layout shift

export function ProductCardSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden">
      {/* Image — 1:1 aspect ratio matching ProductCard */}
      <Skeleton className="aspect-square w-full" />

      {/* Body — matches ProductCard p-3 sm:p-4 layout */}
      <div className="p-3 sm:p-4 space-y-2.5">
        {/* Category badge */}
        <Skeleton className="h-[10px] w-16 rounded-full" />
        {/* Product name (2 lines max like ProductCard) */}
        <Skeleton className="h-[14px] w-[75%]" />
        <Skeleton className="h-[14px] w-[50%]" />
        {/* Price + cart button row */}
        <div className="flex items-end justify-between pt-1">
          <div className="space-y-1">
            <Skeleton className="h-[18px] w-[60px]" />
            <Skeleton className="h-[10px] w-[40px]" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Product List Skeleton (vista lista) ─────────────────────────────────────

export function ProductListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border"
        >
          {/* Thumbnail */}
          <Skeleton className="h-[60px] w-[60px] rounded-lg shrink-0" />
          {/* Name + category */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-[14px] w-[200px] max-w-full" />
            <Skeleton className="h-[10px] w-[80px]" />
          </div>
          {/* Price */}
          <Skeleton className="h-[14px] w-[60px] shrink-0" />
          {/* Cart button */}
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── Product Detail Skeleton ─────────────────────────────────────────────────

export function ProductDetailSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      {/* Breadcrumbs */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 w-3.5 rounded-sm" />
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-3.5 rounded-sm" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Product gallery */}
          <div className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-16 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Right: Product info */}
          <div className="space-y-6">
            {/* Badge */}
            <Skeleton className="h-6 w-16 rounded-full" />
            {/* Title */}
            <Skeleton className="h-9 w-full max-w-md" />
            <Skeleton className="h-9 w-3/4 max-w-xs" />
            {/* Category + rating */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
            {/* Price box */}
            <div className="bg-gray-50 dark:bg-surface rounded-2xl p-5 border border-gray-100 dark:border-card-border space-y-3">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            {/* Add to cart + action buttons */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 flex-1 rounded-xl" />
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-12 w-12 rounded-xl" />
            </div>
            {/* Benefits grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-100 dark:border-card-border">
                  <Skeleton className="h-5 w-5 rounded shrink-0" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </div>
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
