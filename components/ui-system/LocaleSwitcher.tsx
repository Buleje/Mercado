"use client";

/**
 * LocaleSwitcher — Dropdown para cambiar idioma (ES/EN/SHI).
 *
 * Sin emojis ni banderas emoji. Usa icono Globe + iniciales (ES/EN/SHI).
 * Estilo enterprise: 1 color gris, tokens CSS, rounded-lg.
 *
 * Uso tipico: top-right de navbar, junto al avatar del usuario.
 *
 * ADR-068: tokens CSS only, 0 emojis, 0 gradientes.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Check } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { useLocale } from "@/contexts/locale-context";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT } from "@/lib/i18n/translations";

export default function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback(
    (l: typeof LOCALES[number]) => {
      setLocale(l);
      setOpen(false);
    },
    [setLocale],
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Cambiar idioma. Actual: ${LOCALE_LABELS[locale]}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg",
          "border border-[var(--rule-base)] bg-[var(--surface-raised)]",
          "px-2.5 py-2 text-[length:var(--ts-xs)] font-semibold",
          "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          "hover:bg-[var(--surface-sunken)] transition-colors",
          "min-h-[36px]",
        )}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span className="tabular-nums">{LOCALE_SHORT[locale]}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Selector de idioma"
          className={cn(
            "absolute right-0 top-full mt-2 w-48 overflow-hidden z-50",
            "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]",
            "elev-1",
          )}
        >
          <div className="py-1">
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <button
                  key={l}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleSelect(l)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3.5 py-2.5",
                    "text-[length:var(--ts-sm)] text-left transition-colors",
                    "hover:bg-[var(--surface-sunken)]",
                    active
                      ? "text-[var(--text-primary)] font-semibold"
                      : "text-[var(--text-secondary)] font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center shrink-0",
                      "h-6 w-8 rounded border text-[length:var(--ts-2xs)] font-bold",
                      active
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--rule-base)] text-[var(--text-tertiary)]",
                    )}
                    aria-hidden
                  >
                    {LOCALE_SHORT[l]}
                  </span>
                  <span className="flex-1">{LOCALE_LABELS[l]}</span>
                  {active && (
                    <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-[var(--rule-muted)] px-3.5 py-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Traducción parcial en EN/SHI
          </div>
        </div>
      )}
    </div>
  );
}
