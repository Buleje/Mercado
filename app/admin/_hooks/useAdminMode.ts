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
  toggleMode: () => void;
  setMode: (m: AdminMode) => void;
}

const STORAGE_KEY = "admin_mode";

function readStored(): AdminMode {
  if (typeof window === "undefined") return "easy";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "advanced" ? "advanced" : "easy";
  } catch {
    return "easy";
  }
}

function persist(m: AdminMode) {
  try { localStorage.setItem(STORAGE_KEY, m); } catch { /* quota exceeded */ }
  // Fire-and-forget API sync — failures are non-critical
  fetch("/api/admin/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminMode: m }),
  }).catch(() => {});
}

export function useAdminMode(): UseAdminModeResult {
  const [mode, setModeState] = useState<AdminMode>(readStored);

  // Hydrate from API on mount to sync cross-device preference
  useEffect(() => {
    fetch("/api/admin/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { adminMode?: string } | null) => {
        if (data?.adminMode === "easy" || data?.adminMode === "advanced") {
          setModeState(data.adminMode);
          try { localStorage.setItem(STORAGE_KEY, data.adminMode); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((m: AdminMode) => {
    setModeState(m);
    persist(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "easy" ? "advanced" : "easy";
      persist(next);
      return next;
    });
  }, []);

  return { mode, isEasyMode: mode === "easy", toggleMode, setMode };
}

