"use client";

/**
 * app/admin/_hooks/useAdminMode.ts
 *
 * Gestiona el modo del panel admin: "easy" (por defecto) o "advanced".
 *
 * - Modo Fácil: muestra solo los módulos esenciales para el bodeguero
 *   (pedidos, inventario, productos, compras, plata, clientes, fiados, turnos).
 * - Modo Avanzado: desbloquea todos los módulos (analytics, forecasting,
 *   facturación SUNAT, scoring, marketplace ops, delivery, documentos, etc.).
 *
 * Persistencia: localStorage (instantánea) + API para sincronización cross-device.
 * localStorage es la fuente de verdad local; la API hidrata en carga inicial.
 */

import { useCallback, useEffect, useState } from "react";

export type AdminMode = "easy" | "advanced";

export interface UseAdminModeResult {
  mode: AdminMode;
  isEasyMode: boolean;
  /** true salvo que el override dev-only esté activo. */
  isLocked: boolean;
  toggleMode: () => void;
  setMode: (m: AdminMode) => void;
}

// Política actual: el modo del admin queda forzado a "easy" (modo básico) para
// todos los tenants en plan free/trial. El Modo Avanzado es feature de plan
// pago; el flag por-tenant (gestionado por superadmin) está pendiente
// (TODO: surface a flag en Tenant).
//
// Override DEV-ONLY: si `localStorage.admin_mode_dev_unlock === "1"`, se
// restaura el toggle real (default easy, persistido en `admin_mode`). Sirve para
// que el equipo vea/verifique las categorías avanzadas SIN shipear el unlock a
// tenants. No afecta a ningún tenant que no haya puesto la key manualmente.
const FORCED_MODE: AdminMode = "easy";
const STORAGE_KEY = "admin_mode";
const DEV_UNLOCK_KEY = "admin_mode_dev_unlock";

function readDevUnlock(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(DEV_UNLOCK_KEY) === "1"; } catch { return false; }
}

function readStoredMode(): AdminMode {
  if (typeof window === "undefined") return FORCED_MODE;
  try { return localStorage.getItem(STORAGE_KEY) === "advanced" ? "advanced" : "easy"; } catch { return FORCED_MODE; }
}

export function useAdminMode(): UseAdminModeResult {
  // SSR-safe: arrancamos forzados a easy y hidratamos en cliente.
  const [unlocked, setUnlocked] = useState(false);
  const [mode, setModeState] = useState<AdminMode>(FORCED_MODE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dev = readDevUnlock();
    setUnlocked(dev);
    if (dev) {
      setModeState(readStoredMode());
    } else {
      // Sigue lockeado a easy: mantener limpio el localStorage para el código
      // que lee `admin_mode` directamente (sin pasar por este hook).
      try { localStorage.setItem(STORAGE_KEY, FORCED_MODE); } catch { /* quota */ }
    }
  }, []);

  const setMode = useCallback((m: AdminMode) => {
    if (!readDevUnlock()) return; // locked salvo override dev-only
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY, m); } catch { /* quota */ }
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "easy" ? "advanced" : "easy");
  }, [mode, setMode]);

  return {
    mode,
    isEasyMode: mode === "easy",
    isLocked: !unlocked,
    toggleMode,
    setMode,
  };
}
