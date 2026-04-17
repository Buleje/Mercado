"use client";

import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { Slot } from "@radix-ui/react-slot";

const button = tv({
  base: [
    "inline-flex items-center justify-center gap-2",
    "font-bold whitespace-nowrap rounded-full",
    "transition-all duration-150 ease-out",
    "active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:pointer-events-none",
  ],
  variants: {
    variant: {
      primary: [
        "bg-gray-900 dark:bg-white text-white dark:text-gray-900",
        "border border-gray-900 dark:border-white",
        "hover:bg-gray-800 dark:hover:bg-gray-100",
        "focus-visible:ring-gray-900/30 dark:focus-visible:ring-white/30",
      ],
      secondary: [
        "bg-white dark:bg-gray-900 text-gray-900 dark:text-white",
        "border border-gray-200 dark:border-gray-800",
        "hover:border-gray-900 dark:hover:border-gray-400",
        "focus-visible:ring-gray-900/20",
      ],
      ghost: [
        "bg-transparent text-gray-700 dark:text-gray-200",
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        "focus-visible:ring-gray-400",
      ],
      accent: [
        "bg-primary text-white border border-primary",
        "hover:bg-primary/90",
        "focus-visible:ring-primary/30",
      ],
      danger: [
        "bg-red-600 text-white border border-red-600",
        "hover:bg-red-700",
        "focus-visible:ring-red-500/30",
      ],
      link: [
        "text-gray-900 dark:text-white underline-offset-4 hover:underline",
        "px-0 py-0 rounded-none",
      ],
    },
    size: {
      xs: "text-[11px] h-7 px-3",
      sm: "text-xs h-8 px-3.5",
      md: "text-sm h-10 px-5",
      lg: "text-sm h-11 px-6",
      xl: "text-base h-12 px-7",
      icon: "h-10 w-10 p-0",
    },
    fullWidth: {
      true: "w-full",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={button({ variant, size, fullWidth, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
