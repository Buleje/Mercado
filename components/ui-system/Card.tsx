"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const card = tv({
  base: [
    "relative flex flex-col",
    "bg-white dark:bg-gray-900",
    "border border-[var(--rule-base)]",
    "rounded-xl overflow-hidden",
    "transition-colors duration-[var(--dur-base)]",
  ],
  variants: {
    variant: {
      base: "",
      interactive: "hover:border-gray-900 dark:hover:border-gray-500 cursor-pointer",
      lifted: [
        "transition-all duration-[var(--dur-base)] ease-out",
        "hover:border-gray-900 dark:hover:border-gray-500",
        "hover:-translate-y-0.5",
      ],
      flat: "border-transparent bg-gray-50 dark:bg-gray-950",
      inverse: [
        "bg-gray-900 dark:bg-white",
        "text-white dark:text-gray-900",
        "border-gray-900 dark:border-white",
      ],
      outline: "bg-transparent",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-5",
      lg: "p-6 sm:p-8",
      xl: "p-8 sm:p-10",
    },
  },
  defaultVariants: {
    variant: "base",
    padding: "none",
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div ref={ref} className={card({ variant, padding, className })} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`px-6 pt-5 pb-4 border-b border-[var(--rule-base)] ${className}`}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardBody = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div ref={ref} className={`p-6 ${className}`} {...props} />
  ),
);
CardBody.displayName = "CardBody";

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`px-6 py-4 border-t border-[var(--rule-base)] ${className}`}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";
