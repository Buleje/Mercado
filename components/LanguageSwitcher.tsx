"use client";

import { useState, useEffect } from "react";
import { getLocale, setLocale, type Locale } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    setLocaleState(getLocale());
  }, []);

  function handleToggle() {
    const next: Locale = locale === "es" ? "qu" : "es";
    setLocale(next);
    setLocaleState(next);
    // Recargar para aplicar el idioma en toda la app
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={locale === "es" ? "Cambiar a Quechua" : "Cambiar a Español"}
      aria-label={locale === "es" ? "Cambiar a Quechua" : "Cambiar a Español"}
      className="
        inline-flex items-center gap-1.5
        px-3 py-1.5
        rounded-full
        border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        text-xs font-bold
        text-gray-700 dark:text-gray-300
        hover:bg-gray-50 dark:hover:bg-gray-700
        transition-colors duration-200
        min-h-[36px]
        select-none
      "
    >
      {locale === "es" ? (
        <>
          <span aria-hidden="true">🇵🇪</span>
          <span>ES</span>
          <span className="text-gray-400 dark:text-gray-500 font-normal">/ QU</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">🌿</span>
          <span>QU</span>
          <span className="text-gray-400 dark:text-gray-500 font-normal">/ ES</span>
        </>
      )}
    </button>
  );
}
