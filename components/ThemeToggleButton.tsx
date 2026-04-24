"use client";

/**
 * ThemeToggleButton — Botón minimalista para cambiar entre claro/oscuro/auto.
 *
 * Ciclo: light → dark → system → light …
 *
 * Tres iconos: Sun (light), Moon (dark), Monitor (system/auto).
 * Muestra el estado actual. Compacto, ideal para navbar.
 */

import { useCallback } from "react";
import { Sun, Moon, Monitor } from "@buleje/design-system/icons";
import { useTheme } from "@/contexts/theme-context";
import { cn } from "@/lib/utils";

interface Props {
  /** Tamaño del boton. Default: "md" (h-9 w-9) */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
} as const;

export default function ThemeToggleButton({ size = "md", className }: Props) {
  const { theme, setTheme } = useTheme();

  const handleCycle = useCallback(() => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }, [theme, setTheme]);

  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
  const label =
    theme === "dark"
      ? "Modo oscuro activo. Cambiá a automático"
      : theme === "system"
      ? "Modo automático. Cambiá a claro"
      : "Modo claro activo. Cambiá a oscuro";

  return (
    <button
      type="button"
      onClick={handleCycle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors active:scale-[0.95]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <Icon
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4",
        )}
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
  );
}
