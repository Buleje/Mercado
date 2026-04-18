"use client";

/**
 * locale-context.tsx — Context global de idioma (ES/EN/SHI).
 *
 * Persistencia: localStorage key `buleje-locale`.
 * SSR-safe: arranca en "es", hidrata en mount.
 *
 * No dependemos de i18next — overhead mínimo. Ver `lib/i18n/translations.ts`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { translate, LOCALES, type Locale } from "@/lib/i18n/translations";

const STORAGE_KEY = "buleje-locale";

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleCtx | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "es";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (LOCALES as readonly string[]).includes(raw)) {
      return raw as Locale;
    }
  } catch {
    /* ignore */
  }
  return "es";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string) => translate(key, locale),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback SSR-safe: devuelve defaults si el provider no envuelve.
    return {
      locale: "es" as Locale,
      setLocale: () => {},
      t: (key: string) => translate(key, "es"),
    };
  }
  return ctx;
}
