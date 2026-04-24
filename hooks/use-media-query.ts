"use client";

/**
 * useMediaQuery — Observa media queries CSS desde JS.
 *
 * Util para decidir comportamiento (no solo CSS). Ej: en mobile
 * mostrar BottomSheet, en desktop un Dropdown.
 *
 * Convenciones Tailwind (mobile-first):
 *   sm  = 640px
 *   md  = 768px
 *   lg  = 1024px
 *   xl  = 1280px
 *   2xl = 1536px
 *
 * API:
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 *   const isTablet = useIsTablet();
 *   const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// Helpers convenientes
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useIsTablet = () => useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsPortrait = () => useMediaQuery("(orientation: portrait)");
export const useIsTouch = () => useMediaQuery("(hover: none) and (pointer: coarse)");
export const usePrefersDarkMode = () => useMediaQuery("(prefers-color-scheme: dark)");
export const useIsOnline = () => {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
};
