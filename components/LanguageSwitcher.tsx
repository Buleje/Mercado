"use client";

/**
 * LanguageSwitcher — dropdown del nav para cambiar idioma globalmente.
 * 4 idiomas: Español (default), English, Shipibo-Konibo, Runa Simi (Quechua).
 *
 * Persiste vía LocaleContext (localStorage). El cliente ve la página
 * traducida en cada componente que use `useLocale().t("key")`.
 */

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/locale-context";
import { LOCALES, LOCALE_SHORT, type Locale } from "@/lib/i18n/translations";
import { Globe, Check, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const NATIVE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
  shi: "Shipibo-Konibo",
  qu: "Runa Simi",
};

const REGION_LABELS: Record<Locale, string> = {
  es: "Perú",
  en: "International",
  shi: "Pucallpa",
  qu: "Andes",
};

interface Props {
  /** Variante del trigger: "ghost" (transparente) o "outline". */
  variant?: "ghost" | "outline";
  className?: string;
}

export default function LanguageSwitcher({ variant = "ghost", className }: Props) {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Cierra el dropdown al click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn("h-10 w-[68px] rounded-full bg-[var(--surface-sunken)]", className)}
      />
    );
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="Cambiar idioma"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Idioma: ${NATIVE_LABELS[locale]}`}
        className={cn(
          "inline-flex items-center gap-1.5 h-10 px-3 rounded-full",
          "text-[length:var(--ts-sm)] font-semibold transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          variant === "ghost"
            ? "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-primary)]",
        )}
      >
        <Globe className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="tabular-nums tracking-wide">{LOCALE_SHORT[locale]}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform opacity-50", open && "rotate-180")}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Idiomas disponibles"
          className={cn(
            "absolute right-0 top-full mt-2 z-50 min-w-[180px]",
            "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]",
            "shadow-md shadow-black/5 overflow-hidden",
            "animate-in fade-in slide-in-from-top-2 duration-150",
          )}
        >
          <ul className="py-1">
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <li key={l}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLocale(l);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      active
                        ? "bg-[var(--surface-sunken)]"
                        : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    {/* Idioma una sola vez: nombre nativo + región (sin duplicar). */}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[length:var(--ts-sm)] font-semibold leading-tight text-[var(--text-primary)]">
                        {NATIVE_LABELS[l]}
                      </span>
                      <span className="mt-0.5 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {REGION_LABELS[l]}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="text-[length:var(--ts-2xs)] font-bold tracking-wider tabular-nums text-[var(--text-tertiary)]"
                    >
                      {LOCALE_SHORT[l]}
                    </span>
                    {active && (
                      <Check
                        className="h-4 w-4 shrink-0 text-[var(--text-primary)]"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
