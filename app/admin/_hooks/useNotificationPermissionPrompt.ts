"use client";

/**
 * app/admin/_hooks/useNotificationPermissionPrompt.ts
 *
 * Hook que pide permiso de notificaciones del navegador 5 segundos después
 * de que el panel admin termine de cargar. Solo lo pide UNA vez (si el
 * usuario ya respondió antes, no insiste).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect } from "react";

const PROMPT_DELAY_MS = 5000;

export function useNotificationPermissionPrompt(
  authReady: boolean,
  hasAsked: boolean,
  permission: NotificationPermission,
  requestPermission: () => void
): void {
  useEffect(() => {
    if (!hasAsked && permission === "default" && authReady) {
      const timer = setTimeout(() => {
        requestPermission();
      }, PROMPT_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [hasAsked, permission, authReady, requestPermission]);
}
