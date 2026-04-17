"use client";

import { forwardRef } from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type Variant =
  | "kicker"      // uppercase tiny label tracking-wider
  | "label"       // xs medium tertiary
  | "body"        // sm normal primary (default)
  | "heading"     // xl bold primary tight
  | "title"       // 2xl extrabold primary tight
  | "kpi-value"   // 2xl extrabold tabular-nums
  | "kpi-delta"   // xs bold tabular
  | "caption";    // 2xs tertiary

type Props = HTMLAttributes<HTMLElement> & {
  variant?: Variant;
  as?: ElementType;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  kicker:
    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]",
  label:
    "text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]",
  body:
    "text-[length:var(--ts-sm)] font-regular text-[var(--text-primary)] leading-[var(--lh-snug)]",
  heading:
    "text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] leading-[var(--lh-tight)] tracking-[var(--ls-tight)]",
  title:
    "text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-primary)] leading-[var(--lh-tight)] tracking-[var(--ls-tight)]",
  "kpi-value":
    "text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-primary)] tabular-nums leading-[var(--lh-tight)]",
  "kpi-delta":
    "text-[length:var(--ts-xs)] font-bold tabular-nums",
  caption:
    "text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]",
};

const DEFAULT_ELEMENT: Record<Variant, ElementType> = {
  kicker: "span",
  label: "span",
  body: "p",
  heading: "h3",
  title: "h2",
  "kpi-value": "p",
  "kpi-delta": "span",
  caption: "span",
};

export const Text = forwardRef<HTMLElement, Props>(function Text(
  { variant = "body", as, className, children, ...rest },
  ref,
) {
  const Comp = (as ?? DEFAULT_ELEMENT[variant]) as ElementType;
  return (
    <Comp
      ref={ref}
      className={cn(VARIANT_CLASSES[variant], className)}
      {...rest}
    >
      {children}
    </Comp>
  );
});
