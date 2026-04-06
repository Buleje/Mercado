"use client";

/**
 * app/admin/_hooks/useOnboardingTourTrigger.ts
 *
 * Hook que dispara el tour de onboarding (UI guiada) la primera vez que
 * un usuario visita el panel.
 *
 * Reglas:
 *  - NO disparar si SuperAdmin está impersonando un tenant
 *  - NO disparar si la URL es `/t/{slug}/admin` (ruta de superadmin)
 *  - SÍ disparar si `onboarding.isFirstVisit && !onboarding.isTourActive`
 *  - Delay de 800 ms para que el sidebar renderice primero
 *
 * No confundir con `useOnboardingTrigger`, que es el wizard modal de
 * "completar configuración inicial" — son flujos distintos.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect } from "react";

const TOUR_DELAY_MS = 800;

export interface OnboardingApi {
  isFirstVisit: boolean;
  isTourActive: boolean;
  startTour: () => void;
}

export function useOnboardingTourTrigger(onboarding: OnboardingApi): void {
  useEffect(() => {
    try {
      if (localStorage.getItem("superadmin-impersonate-tenant")) return;
    } catch {}
    if (typeof window !== "undefined" && /\/t\/[^/]+\/admin/.test(window.location.pathname)) {
      return;
    }
    if (onboarding.isFirstVisit && !onboarding.isTourActive) {
      const t = setTimeout(() => onboarding.startTour(), TOUR_DELAY_MS);
      return () => clearTimeout(t);
    }
  // El effect debe correr UNA sola vez al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
