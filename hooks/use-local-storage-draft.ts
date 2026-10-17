"use client";
import { useState, useCallback } from "react";

export function useLocalStorageDraft<T>(key: string) {
  const [hasDraft, setHasDraft] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(key) !== null;
  });

  /** `false` si el navegador no lo dejó guardar (cuota llena, modo privado). */
  const save = useCallback((data: T): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      setHasDraft(true);
      return true;
    } catch { return false; }
  }, [key]);

  const load = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  }, [key]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setHasDraft(false);
  }, [key]);

  return { save, load, clear, hasDraft };
}
