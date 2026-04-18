"use client";

import { useEffect, useState } from "react";

/**
 * useDebouncedValue — retorna el valor con delay, salta updates intermedios.
 *
 * Critico para cumplir INP <200ms en:
 *   - Search boxes (cada keystroke no dispara request)
 *   - Filtros que triggering re-render pesado
 *   - Draft autosave
 *
 * @example
 * const [query, setQuery] = useState("");
 * const debouncedQuery = useDebouncedValue(query, 300);
 * // Solo dispara fetch cuando el usuario deja de tipear 300ms
 * useEffect(() => { searchAPI(debouncedQuery); }, [debouncedQuery]);
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
