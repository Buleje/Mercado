"use client";

/**
 * LocaleToggleButton — Toggle minimalista de idioma ES/EN/SHI (Shipibo).
 *
 * Ciclo: es → en → shi → es
 *
 * Visual: chip compacto con codigo uppercase (ES/EN/SHI) + icon Languages.
 * Al click cambia el idioma. Se renderiza en navbar.
 *
 * Shipibo — idioma amazónico de Pucallpa. Inclusión diferencial cultural.
 */

import { useCallback } from "react";
import { Globe } from "@buleje/design-system/icons";
import { useLocale } from "@/contexts/locale-context";
import type { Locale } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

interface Props {
  /** Tamaño del boton. Default: "md" */
  size?: "sm" | "md" | "lg";
  /** Mostrar ícono Languages además del código. Default: false */
  showIcon?: boolean;
  className?: string;
}

const NEXT_LOCALE: Record<Locale, Locale> = {
  es: "en",
  en: "shi",
  shi: "es",
};

const LABEL: Record<Locale, string> = {
  es: "ES",
  en: "EN",
  shi: "SHI",
};

const FULL_NAME: Record<Locale, string> = {
  es: "Español",
  en: "English",
  shi: "Shipibo",
};

const HEIGHT_CLASSES = {
  sm: "h-8 px-2.5 text-[length:var(--ts-2xs)]",
  md: "h-9 px-3 text-xs",
  lg: "h-10 px-4 text-sm",
} as const;

export default function LocaleToggleButton({
  size = "md",
  showIcon = false,
  className,
}: Props) {
  const { locale, setLocale } = useLocale();

  const handleCycle = useCallback(() => {
    setLocale(NEXT_LOCALE[locale]);
  }, [locale, setLocale]);

  const next = NEXT_LOCALE[locale];

  return (
    <button
      type="button"
      onClick={handleCycle}
      aria-label={`Idioma actual: ${FULL_NAME[locale]}. Cambiar a ${FULL_NAME[next]}`}
      title={`Cambiar a ${FULL_NAME[next]}`}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] font-bold tabular-nums text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors active:scale-[0.95]",
        HEIGHT_CLASSES[size],
        className,
      )}
    >
      {showIcon && (
        <Globe
          className={cn(size === "sm" ? "h-3 w-3" : size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5")}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      <span>{LABEL[locale]}</span>
    </button>
  );
}
