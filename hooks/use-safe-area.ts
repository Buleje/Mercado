"use client";

/**
 * useSafeArea — Lee los insets del viewport (iOS notch, Android nav bar).
 *
 * Devuelve los valores en px de env(safe-area-inset-*) como numeros JS.
 * Si no hay notch, retorna 0 en cada lado.
 *
 * Uso:
 *   const insets = useSafeArea();
 *   return <div style={{ paddingBottom: insets.bottom }}>...</div>;
 *
 * Para CSS directo, prefiere usar env(safe-area-inset-*) o las utility
 * classes de Tailwind `pb-safe`, `pt-safe` (via plugin).
 */

import { useEffect, useState } from "react";

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function readInsets(): SafeAreaInsets {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const style = getComputedStyle(document.documentElement);
  const pick = (name: string) => {
    const raw = style.getPropertyValue(`--sai-${name}`).trim();
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: pick("top"),
    right: pick("right"),
    bottom: pick("bottom"),
    left: pick("left"),
  };
}

export function useSafeArea(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    // CSS vars se definen en globals.css (sai-*)
    setInsets(readInsets());

    const handle = () => setInsets(readInsets());
    window.addEventListener("orientationchange", handle);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("orientationchange", handle);
      window.removeEventListener("resize", handle);
    };
  }, []);

  return insets;
}

/**
 * useIsInstalledPWA — Detecta si la app corre como PWA standalone (sin
 * chrome de browser). Relevante para fixed bottom bars que necesitan
 * insets adicionales.
 */
export function useIsInstalledPWA(): boolean {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(display-mode: standalone)");
    setIsPWA(query.matches);
    const handler = (e: MediaQueryListEvent) => setIsPWA(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return isPWA;
}
