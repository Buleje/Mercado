"use client";

/**
 * app/admin/_hooks/useOnboardingTrigger.ts
 *
 * Hook que decide si mostrar el wizard de onboarding al usuario.
 * Reglas:
 *  - NO mostrar si SuperAdmin está impersonando un tenant (bloquearía la UI)
 *  - NO mostrar si la clave `onboarding-completed-${slug}` existe
 *  - SÍ mostrar después de un delay de 1.2s (para que el panel renderice primero)
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useState } from "react";

const ONBOARDING_DELAY_MS = 1200;

export interface UseOnboardingTriggerResult {
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
}

export function useOnboardingTrigger(): UseOnboardingTriggerResult {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    try {
      // Saltar si SuperAdmin está impersonando — el wizard bloquea toda la UI
      if (localStorage.getItem("superadmin-impersonate-tenant")) return;
      const slug = localStorage.getItem("active-tenant-slug") ?? "main";
      const key = `onboarding-completed-${slug}`;
      if (localStorage.getItem(key)) return;
      const t = setTimeout(() => setShowOnboarding(true), ONBOARDING_DELAY_MS);
      return () => clearTimeout(t);
    } catch {}
  }, []);

  return { showOnboarding, setShowOnboarding };
}
