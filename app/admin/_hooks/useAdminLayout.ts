"use client";

/**
 * app/admin/_hooks/useAdminLayout.ts
 *
 * Hook que agrupa el estado de layout del panel admin.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Estado manejado:
 *  - mobileNavOpen      → drawer móvil del sidebar
 *  - compactMode        → sidebar colapsado en escritorio (persiste en localStorage)
 *  - focusMode          → sidebar reducido a iconos (persiste en localStorage)
 *  - presentationMode   → modo presentación a pantalla completa (no persiste)
 *
 * Side-effects:
 *  - Bloquea el scroll del body cuando el drawer móvil está abierto
 *  - Cierra el drawer móvil al presionar Escape o al redimensionar a >= 640px
 *
 * Uso:
 * ```tsx
 * const {
 *   mobileNavOpen, setMobileNavOpen,
 *   compactMode, toggleCompact,
 *   focusMode, toggleFocusMode,
 *   presentationMode, setPresentationMode,
 * } = useAdminLayout();
 * ```
 */

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useScrollLock } from "@/hooks/use-scroll-lock";

export interface UseAdminLayoutResult {
  mobileNavOpen: boolean;
  setMobileNavOpen: Dispatch<SetStateAction<boolean>>;
  compactMode: boolean;
  toggleCompact: () => void;
  focusMode: boolean;
  toggleFocusMode: () => void;
  presentationMode: boolean;
  setPresentationMode: Dispatch<SetStateAction<boolean>>;
}

export function useAdminLayout(): UseAdminLayoutResult {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_compact") === "1";
  });
  const [focusMode, setFocusMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_focus_mode") === "1";
  });
  const [presentationMode, setPresentationMode] = useState(false);

  // Bloquea scroll del body cuando el menú móvil está abierto
  useScrollLock(mobileNavOpen);

  // Cierra el drawer móvil al presionar Escape o al redimensionar a desktop
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 640) setMobileNavOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const toggleCompact = useCallback(() => {
    setCompactMode((prev) => {
      const next = !prev;
      localStorage.setItem("admin_compact", next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      localStorage.setItem("admin_focus_mode", next ? "1" : "0");
      return next;
    });
  }, []);

  return {
    mobileNavOpen,
    setMobileNavOpen,
    compactMode,
    toggleCompact,
    focusMode,
    toggleFocusMode,
    presentationMode,
    setPresentationMode,
  };
}
