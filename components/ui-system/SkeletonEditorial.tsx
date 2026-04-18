"use client";

import { cn } from "@/lib/utils";

/**
 * SkeletonEditorial v4 — skeleton shimmer unificado.
 *
 * Reemplaza los 3-4 skeletons ad-hoc esparcidos en el proyecto.
 * Usa tokens del sistema (surface-sunken + accent). Respeta
 * prefers-reduced-motion (queda estatico sin shimmer).
 *
 * @example
 * <SkeletonEditorial className="h-4 w-48" />
 * <SkeletonEditorial variant="avatar" />
 * <SkeletonEditorial variant="title" />
 *
 * Para cards enteros usar los compound patterns:
 * <SkeletonCard variant="product" />
 */

interface SkeletonEditorialProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variante preset — default "box" */
  variant?: "box" | "text" | "title" | "caption" | "avatar" | "chip" | "button";
  /** Width override — ej "60%" o "120px" */
  width?: string | number;
  /** Height override */
  height?: string | number;
  /** Rounded — default segun variant */
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "pill";
}

const VARIANT_CLASSES: Record<NonNullable<SkeletonEditorialProps["variant"]>, string> = {
  box: "h-4 w-full rounded-md",
  text: "h-3.5 w-full rounded-sm",
  title: "h-7 w-2/3 rounded-md",
  caption: "h-2.5 w-1/3 rounded-sm",
  avatar: "h-10 w-10 rounded-full",
  chip: "h-6 w-20 rounded-full",
  button: "h-10 w-32 rounded-full",
};

const ROUNDED: Record<NonNullable<SkeletonEditorialProps["rounded"]>, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  pill: "rounded-full",
};

export function SkeletonEditorial({
  variant = "box",
  width,
  height,
  rounded,
  className,
  style,
  ...rest
}: SkeletonEditorialProps) {
  return (
    <div
      className={cn(
        "skeleton-v4",
        VARIANT_CLASSES[variant],
        rounded && ROUNDED[rounded],
        className,
      )}
      style={{
        ...(width != null && { width: typeof width === "number" ? `${width}px` : width }),
        ...(height != null && { height: typeof height === "number" ? `${height}px` : height }),
        ...style,
      }}
      aria-hidden
      {...rest}
    />
  );
}

/**
 * SkeletonProductCard — patron estandar para ProductCard loading.
 */
export function SkeletonProductCard() {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <SkeletonEditorial className="aspect-square w-full rounded-none" />
      <div className="p-4 space-y-2.5">
        <SkeletonEditorial variant="caption" width="40%" />
        <SkeletonEditorial variant="text" width="75%" />
        <SkeletonEditorial variant="text" width="50%" />
        <div className="flex items-end justify-between pt-2">
          <div className="space-y-1.5">
            <SkeletonEditorial variant="box" width="60px" height="18px" />
            <SkeletonEditorial variant="caption" width="40px" />
          </div>
          <SkeletonEditorial variant="avatar" width={40} height={40} rounded="md" />
        </div>
      </div>
    </div>
  );
}

/**
 * SkeletonKPICard — KPI card loading state.
 */
export function SkeletonKPICard() {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <SkeletonEditorial variant="caption" width="40%" className="mb-3" />
      <SkeletonEditorial variant="title" width="60%" className="mb-4" />
      <div className="flex items-center justify-between">
        <SkeletonEditorial variant="chip" width="50px" />
        <SkeletonEditorial width="80px" height="28px" rounded="sm" />
      </div>
    </div>
  );
}

/**
 * SkeletonTableRow — fila de tabla admin.
 */
export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr className="border-b border-[var(--rule-soft)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-3">
          <SkeletonEditorial variant="text" width={i === 0 ? "70%" : "50%"} />
        </td>
      ))}
    </tr>
  );
}

/**
 * SkeletonList — lista generica con avatar + text lines.
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
          <SkeletonEditorial variant="avatar" />
          <div className="flex-1 space-y-2">
            <SkeletonEditorial variant="text" width="45%" />
            <SkeletonEditorial variant="caption" width="30%" />
          </div>
          <SkeletonEditorial variant="chip" width="60px" />
        </div>
      ))}
    </div>
  );
}
