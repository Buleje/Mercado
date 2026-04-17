"use client";

/**
 * app/admin/_hooks/useTabFrequency.ts
 *
 * Hook de tracking de frecuencia de uso de tabs del admin.
 * Almacena contadores en localStorage (key: `admin-tab-frequency`).
 *
 * Expone:
 *  - `trackTab(tabId)` — registra un uso del tab (incrementa count, actualiza lastUsed)
 *  - `getTopTabs(n)`   — devuelve los N tabs más usados (por count, desempate por lastUsed)
 *
 * IMPORTANTE: Este hook es solo tracking. NO reordena el sidebar.
 * Los datos se usan para la sección "Favoritos" que ya existe.
 */

import { useCallback, useRef } from "react";

const STORAGE_KEY = "admin-tab-frequency";

type TabFrequency = Record<string, { count: number; lastUsed: number }>;

function readFrequency(): TabFrequency {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TabFrequency;
  } catch {
    return {};
  }
}

function writeFrequency(data: TabFrequency): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage no disponible — ignorar
  }
}

export interface UseTabFrequencyResult {
  trackTab: (tabId: string) => void;
  getTopTabs: (n: number) => string[];
}

export function useTabFrequency(): UseTabFrequencyResult {
  // Ref para evitar re-renders innecesarios — los datos viven en localStorage
  const cacheRef = useRef<TabFrequency | null>(null);

  const getCache = useCallback((): TabFrequency => {
    if (cacheRef.current === null) {
      cacheRef.current = readFrequency();
    }
    return cacheRef.current;
  }, []);

  const trackTab = useCallback(
    (tabId: string): void => {
      const freq = getCache();
      const entry = freq[tabId] ?? { count: 0, lastUsed: 0 };
      entry.count += 1;
      entry.lastUsed = Date.now();
      freq[tabId] = entry;
      cacheRef.current = freq;
      writeFrequency(freq);
    },
    [getCache],
  );

  const getTopTabs = useCallback(
    (n: number): string[] => {
      const freq = getCache();
      return Object.entries(freq)
        .sort(([, a], [, b]) => {
          // Primero por count descendente, desempate por lastUsed descendente
          if (b.count !== a.count) return b.count - a.count;
          return b.lastUsed - a.lastUsed;
        })
        .slice(0, n)
        .map(([tabId]) => tabId);
    },
    [getCache],
  );

  return { trackTab, getTopTabs };
}
