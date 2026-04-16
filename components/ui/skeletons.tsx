"use client";

import { cn } from "@/lib/utils";

// ── Shared props ─────────────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
  [key: string]: unknown;
}

// ── TabLoadingSkeleton ── Full-page spinner replacement for admin tabs ───────

export function TabLoadingSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex justify-center py-20", className)} role="status" aria-label="Cargando...">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}

// ── ListSkeleton ── Simulates rows of a data table/list ─────────────────────

interface ListSkeletonProps extends SkeletonProps {
  rows?: number;
  variant?: "table" | "cards" | "compact";
}

export function ListSkeleton({ rows = 5, variant = "table", className }: ListSkeletonProps) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3", className)} role="status" aria-label="Cargando productos...">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl bg-muted animate-pulse">
            <div className="aspect-square rounded-t-xl bg-muted-foreground/10" />
            <div className="p-3 space-y-2">
              <div className="h-3 rounded bg-muted-foreground/15 w-3/4" />
              <div className="h-3 rounded bg-muted-foreground/10 w-1/2" />
            </div>
          </div>
        ))}
        <span className="sr-only">Cargando productos...</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)} role="status" aria-label="Cargando lista...">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
        <span className="sr-only">Cargando lista...</span>
      </div>
    );
  }

  // variant === "table"
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Cargando tabla...">
      {/* Header row */}
      <div className="flex gap-4 px-4 py-2">
        <div className="h-3 rounded bg-muted-foreground/15 w-1/6" />
        <div className="h-3 rounded bg-muted-foreground/15 w-1/4" />
        <div className="h-3 rounded bg-muted-foreground/10 w-1/6" />
        <div className="h-3 rounded bg-muted-foreground/10 w-1/6" />
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl bg-muted px-4 py-3 animate-pulse">
          <div className="h-9 w-9 rounded-lg bg-muted-foreground/10 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded bg-muted-foreground/15 w-2/3" />
            <div className="h-2.5 rounded bg-muted-foreground/10 w-1/3" />
          </div>
          <div className="h-6 w-16 rounded-full bg-muted-foreground/10" />
        </div>
      ))}
      <span className="sr-only">Cargando tabla...</span>
    </div>
  );
}

// ── KPISkeleton ── KPI cards grid ───────────────────────────────────────────

interface KPISkeletonProps extends SkeletonProps {
  count?: number;
}

export function KPISkeleton({ count = 4, className }: KPISkeletonProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)} role="status" aria-label="Cargando métricas...">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-muted p-4 animate-pulse space-y-3">
          <div className="h-3 rounded bg-muted-foreground/15 w-1/2" />
          <div className="h-6 rounded bg-muted-foreground/10 w-3/4" />
          <div className="h-2.5 rounded bg-muted-foreground/10 w-1/3" />
        </div>
      ))}
      <span className="sr-only">Cargando métricas...</span>
    </div>
  );
}
