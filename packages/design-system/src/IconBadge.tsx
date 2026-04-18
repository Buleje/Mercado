"use client";

import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "./utils";

type Size = "xs" | "sm" | "md" | "step" | "lg" | "xl";
type Shape = "circle" | "square";
type Intent = "primary" | "muted" | "success" | "warning" | "danger";

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  children: ReactNode;
  size?: Size;
  shape?: Shape;
  intent?: Intent;
  asDiv?: boolean;
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-4 w-4 text-[length:var(--ts-2xs)]",
  sm: "h-5 w-5 text-[length:var(--ts-xs)]",
  md: "h-9 w-9 text-sm",
  step: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-14 w-14 text-lg",
};

const SHAPE_CLASSES: Record<Shape, string> = {
  circle: "rounded-full",
  square: "rounded-lg",
};

const INTENT_CLASSES: Record<Intent, string> = {
  primary: "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
  muted: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  success: "bg-[var(--data-success)] text-white",
  warning: "bg-[var(--data-warning)] text-white",
  danger: "bg-[var(--data-error)] text-white",
};

export function IconBadge({
  children,
  size = "md",
  shape = "circle",
  intent = "primary",
  asDiv,
  className,
  ...rest
}: Props) {
  const Comp = asDiv ? "div" : "span";
  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold tabular-nums",
        SHAPE_CLASSES[shape],
        SIZE_CLASSES[size],
        INTENT_CLASSES[intent],
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
