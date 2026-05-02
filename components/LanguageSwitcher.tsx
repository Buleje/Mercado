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
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/lib/i18n/translations";
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

const TONE_BG: Record<Locale, string> = {
  es: "var(--brand-primary, #00B4A6)",
  en: "#0ea5e9",
  shi: "#16a34a",
  qu: "#d97706",
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
          "inline-flex items-center gap-2 h-10 px-3.5 rounded-full",
          "text-[length:var(--ts-sm)] font-extrabold transition-all active:scale-95",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          variant === "ghost"
            ? "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            : "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        )}
      >
        <Globe className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        <span className="tabular-nums tracking-wider">{LOCALE_SHORT[locale]}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform opacity-60", open && "rotate-180")}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Idiomas disponibles"
          className={cn(
            "absolute right-0 top-full mt-2 z-50 min-w-[220px]",
            "rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]",
            "shadow-xl shadow-black/5 overflow-hidden",
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
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      active
                        ? "bg-[var(--accent-soft,rgba(0,180,166,0.08))]"
                        : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    {/* Code badge — typografía monoespaciada en circle tonal */}
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[length:var(--ts-xs)] font-black tracking-wider shrink-0 text-white shadow-sm"
                      style={{ backgroundColor: TONE_BG[l] }}
                    >
                      {LOCALE_SHORT[l]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--ts-sm)] font-extrabold leading-tight text-[var(--text-primary)]">
                        {NATIVE_LABELS[l]}
                      </div>
                      <div className="mt-0.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
                        {LOCALE_LABELS[l]} · {REGION_LABELS[l]}
                      </div>
                    </div>
                    {active && (
                      <Check
                        className="h-4 w-4 text-[var(--accent)] shrink-0"
                        strokeWidth={2.75}
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
            Por defecto: <span className="text-[var(--text-secondary)]">Español</span>
          </div>
        </div>
      )}
    </div>
  );
}
