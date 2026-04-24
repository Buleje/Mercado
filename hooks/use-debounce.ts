"use client";

/**
 * useDebounce — Retrasa la propagacion de un valor hasta que se estabilice.
 * useDebouncedCallback — Retrasa la ejecucion de un callback.
 *
 * Caso de uso tipico: search input con API calls. Evita disparar 10 fetches
 * por palabra; espera 300ms desde el ultimo keystroke.
 *
 * API:
 *   const [q, setQ] = useState("");
 *   const debouncedQ = useDebounce(q, 300);
 *   useEffect(() => { void fetch(debouncedQ); }, [debouncedQ]);
 *
 *   const debouncedSave = useDebouncedCallback((val) => save(val), 500);
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}

/**
 * useThrottle — Limita a una ejecucion cada N ms (leading-edge).
 * Util para scroll, resize handlers.
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs: number,
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const lastCallRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      if (now - lastCallRef.current >= intervalMs) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    },
    [intervalMs],
  );
}
