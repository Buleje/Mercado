"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "@buleje/design-system/icons";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "icon" | "segmented";
}

/**
 * ThemeToggle
 *
 * Variant "icon" — un botón que cicla light → dark → system (default).
 * Variant "segmented" — 3 botones en un pill para elegir explícito.
 */
export default function ThemeToggle({ className, variant = "icon" }: Props) {
  const { theme, resolved, setTheme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // SSR placeholder — reserva espacio sin hydration mismatch
    return (
      <div
        aria-hidden="true"
        className={cn(
          "h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-800",
          className,
        )}
      />
    );
  }

  if (variant === "segmented") {
    const options: { id: "light" | "dark" | "system"; icon: React.ElementType; label: string }[] = [
      { id: "light", icon: Sun, label: "Claro" },
      { id: "dark", icon: Moon, label: "Oscuro" },
      { id: "system", icon: Monitor, label: "Auto" },
    ];
    return (
      <div
        role="radiogroup"
        aria-label="Tema"
        className={cn(
          "inline-flex items-center gap-0.5 p-0.5 rounded-xl",
          "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
          className,
        )}
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Tema ${opt.label}`}
              onClick={() => setTheme(opt.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                active
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Icon variant
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label =
    theme === "light"
      ? "Tema claro — tocá para activar oscuro"
      : theme === "dark"
      ? "Tema oscuro — tocá para modo automático"
      : `Tema automático (${resolved}) — tocá para claro`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
        "hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white",
        "transition-all active:scale-95",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
