"use client";

/**
 * Shimmer — Skeleton primitivo con onda brillante (no pulse).
 *
 * Estilo enterprise tipo LinkedIn / Facebook / Amazon. La animacion
 * es un gradient linear que se desliza de izquierda a derecha con
 * background-size 200% y animation sobre background-position.
 *
 * Respeta prefers-reduced-motion (fallback a pulse sutil).
 *
 * Uso:
 *   <Shimmer className="h-4 w-32 rounded" />
 *   <Shimmer className="h-40 w-full rounded-2xl" />
 *   <ShimmerText lines={3} />
 *   <ShimmerCircle size={48} />
 */

import { cn } from "@/lib/utils";

const SHIMMER_BASE =
  "relative overflow-hidden " +
  "bg-linear-to-r from-[var(--surface-sunken)] via-[var(--surface-raised)] to-[var(--surface-sunken)] " +
  "bg-[length:200%_100%] animate-[shimmer_1.8s_infinite_linear] " +
  "motion-reduce:animate-pulse";

interface ShimmerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Shimmer({ className, ...rest }: ShimmerProps) {
  return <div className={cn(SHIMMER_BASE, className)} aria-hidden {...rest} />;
}

interface ShimmerTextProps {
  /** Numero de lineas. Default: 3 */
  lines?: number;
  /** Ancho de la ultima linea (default 70%) */
  lastLineWidth?: string;
  className?: string;
}

export function ShimmerText({
  lines = 3,
  lastLineWidth = "70%",
  className,
}: ShimmerTextProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className="h-3 rounded"
          style={{
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

interface ShimmerCircleProps {
  size?: number;
  className?: string;
}

export function ShimmerCircle({ size = 40, className }: ShimmerCircleProps) {
  return (
    <Shimmer
      className={cn("rounded-full shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Card skeleton con imagen + titulo + 2 lineas + meta */
export function ShimmerCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <Shimmer className="aspect-[4/3] w-full" />
      <div className="p-4 space-y-3">
        <Shimmer className="h-5 w-3/4 rounded" />
        <ShimmerText lines={2} lastLineWidth="60%" />
        <div className="flex items-center gap-3 pt-1">
          <Shimmer className="h-3 w-16 rounded" />
          <Shimmer className="h-3 w-20 rounded" />
        </div>
      </div>
    </div>
  );
}
