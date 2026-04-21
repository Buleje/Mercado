"use client";

/**
 * useValidatedLocalStorage<T>(key, schema, fallback) — hook unificado para
 * persistir estado en localStorage CON validación Zod en cada lectura.
 *
 * Diferencia con useLocalStorage (legacy): aquí el schema es obligatorio. Los
 * datos corruptos o legacy se sanean automáticamente. No se hace throw — se
 * cae al fallback. Cumple regla CLAUDE.md #2 (safeParse, nunca parse).
 *
 * Objetivo: reemplazar las N implementaciones ad-hoc de getRecent/loadPlans/
 * loadFavorites que cada context tiene. Cada una tenía su propio try/catch,
 * coerción de tipos, y criterios de qué tirar.
 *
 * Features:
 *   - safeParse en lectura — datos corruptos → fallback, no throw.
 *   - Persistencia fire-and-forget al escribir (quota exceeded no bloquea).
 *   - Sync multi-tab via StorageEvent.
 *   - SSR-safe: render inicial usa fallback (sin window).
 *
 * Uso:
 *   import { RecentlyViewedArraySchema } from "@/lib/validations/recently-viewed.schema";
 *
 *   const [items, setItems] = useValidatedLocalStorage(
 *     "buleje-recently-viewed",
 *     RecentlyViewedArraySchema,
 *     [],
 *   );
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";

type Setter<T> = (next: T | ((prev: T) => T)) => void;

export function useValidatedLocalStorage<T>(
  key: string,
  schema: ZodType<T>,
  fallback: T,
): [T, Setter<T>] {
  const fallbackRef = useRef(fallback);
  const [value, setValue] = useState<T>(fallback);

  // Hydrate after mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        setValue(parsed.data);
      } else {
        // Datos corruptos → limpiamos para no persistir basura en próximo write.
        localStorage.removeItem(key);
      }
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }, [key, schema]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      if (e.newValue == null) {
        setValue(fallbackRef.current);
        return;
      }
      try {
        const parsed = schema.safeParse(JSON.parse(e.newValue));
        if (parsed.success) setValue(parsed.data);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, schema]);

  const set: Setter<T> = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem(key, JSON.stringify(resolved));
          }
        } catch {
          // quota exceeded / private mode → no bloquea el estado en memoria
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
