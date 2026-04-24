"use client";

/**
 * useFiltersURLState — Sincroniza state de filtros con query params de la URL.
 *
 * Permite:
 *   - Compartir búsqueda/filtros por link
 *   - Back/forward del browser funciona como el usuario espera
 *   - Recuperar filtros al recargar
 *   - Deep-linking desde email/WhatsApp/SEO
 *
 * API:
 *   const { filters, setFilter, clear } = useFiltersURLState({
 *     category: "all",
 *     sortBy: "relevance",
 *     priceMin: 0,
 *     priceMax: 500,
 *   });
 *
 * Internals: usa useSearchParams + router.replace (no push, para no
 * poluir historia con cada keystroke). Debounce configurable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type FilterValue = string | number | boolean | null;

interface Options<T extends Record<string, FilterValue>> {
  /** Valores default. Claves = nombres de los query params. */
  defaults: T;
  /** Debounce ms para URL update. Default 250 */
  debounceMs?: number;
  /** Si true, usa router.push en vez de replace (pollute history) */
  pushHistory?: boolean;
}

function parseValue(raw: string | null, defaultValue: FilterValue): FilterValue {
  if (raw === null) return defaultValue;
  if (typeof defaultValue === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
  }
  if (typeof defaultValue === "boolean") {
    return raw === "true";
  }
  return raw;
}

export function useFiltersURLState<T extends Record<string, FilterValue>>(
  options: Options<T>,
) {
  const { defaults, debounceMs = 250, pushHistory = false } = options;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Valor inicial: combinar URL + defaults
  const initial = useMemo(() => {
    const obj: Record<string, FilterValue> = {};
    for (const [key, def] of Object.entries(defaults)) {
      obj[key] = parseValue(sp.get(key), def);
    }
    return obj as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<T>(initial);

  // Sync filters → URL (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value === defaults[key] || value == null || value === "") continue;
        params.set(key, String(value));
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (pushHistory) {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [filters, pathname, router, debounceMs, defaults, pushHistory]);

  // Sync URL (browser back/fwd) → filters
  useEffect(() => {
    const next: Record<string, FilterValue> = {};
    for (const [key, def] of Object.entries(defaults)) {
      next[key] = parseValue(sp.get(key), def);
    }
    setFilters((prev) => {
      // Solo update si hay diferencia real (evita loop)
      const changed = Object.keys(next).some((k) => next[k] !== prev[k]);
      return changed ? (next as T) : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setMultiple = useCallback((patch: Partial<T>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback(() => {
    setFilters(defaults);
  }, [defaults]);

  const hasActive = useMemo(
    () =>
      Object.keys(filters).some(
        (k) => filters[k] !== defaults[k] && filters[k] != null && filters[k] !== "",
      ),
    [filters, defaults],
  );

  return { filters, setFilter, setMultiple, clear, hasActive };
}
