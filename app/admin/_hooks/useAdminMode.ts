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
  /** Always returns true — los modos avanzados estan deshabilitados por defecto. */
  isLocked: boolean;
  toggleMode: () => void;
  setMode: (m: AdminMode) => void;
}

// Política actual: el modo del admin queda forzado a "easy" (modo basico)
// para todos los tenants en plan free/trial. Los modos avanzados se habilitan
// solo cuando el superadmin lo permita explicitamente (TODO: surface a flag
// en Tenant). Hasta entonces, ignoramos el localStorage previo y el endpoint
// de preferencias devuelve solo lectura.
const FORCED_MODE: AdminMode = "easy";
const STORAGE_KEY = "admin_mode";

export function useAdminMode(): UseAdminModeResult {
  const [mode] = useState<AdminMode>(FORCED_MODE);

  // Mantener el localStorage limpio para que el resto del codigo que lee
  // `admin_mode` directamente (sin pasar por este hook) tambien vea "easy".
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(STORAGE_KEY, FORCED_MODE); } catch { /* quota */ }
  }, []);

  const noop = useCallback(() => {
    // Modo locked: cualquier intento de toggle se ignora silenciosamente.
  }, []);

  return {
    mode,
    isEasyMode: true,
    isLocked: true,
    toggleMode: noop,
    setMode: noop,
  };
}

