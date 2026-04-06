"use client";

/**
 * app/admin/_hooks/useAdminModals.ts
 *
 * Hook que agrupa los flags de visibilidad de los modals globales del
 * panel admin. Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Modals manejados:
 *  - `showShortcuts`     → modal de atajos de teclado (Cmd/Ctrl + ?)
 *  - `searchOpen`        → command palette / búsqueda global (Cmd/Ctrl + K)
 *  - `showModuleManager` → modal de gestión de módulos (también escucha
 *                          el evento DOM `"open-module-manager"` que
 *                          dispara `SettingsModule`)
 *  - `showCierreDiario`  → modal de cierre diario de caja
 *  - `showChangelog`     → modal de changelog / novedades
 *
 * Uso:
 * ```tsx
 * const {
 *   showShortcuts, setShowShortcuts,
 *   searchOpen, setSearchOpen,
 *   showModuleManager, setShowModuleManager,
 *   showCierreDiario, setShowCierreDiario,
 *   showChangelog, setShowChangelog,
 * } = useAdminModals();
 * ```
 */

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export interface UseAdminModalsResult {
  showShortcuts: boolean;
  setShowShortcuts: Dispatch<SetStateAction<boolean>>;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  showModuleManager: boolean;
  setShowModuleManager: Dispatch<SetStateAction<boolean>>;
  showCierreDiario: boolean;
  setShowCierreDiario: Dispatch<SetStateAction<boolean>>;
  showChangelog: boolean;
  setShowChangelog: Dispatch<SetStateAction<boolean>>;
}

export function useAdminModals(): UseAdminModalsResult {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showModuleManager, setShowModuleManager] = useState(false);
  const [showCierreDiario, setShowCierreDiario] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Listener del evento DOM "open-module-manager" disparado por SettingsModule
  // (mantener acoplado al estado de showModuleManager para evitar drift)
  useEffect(() => {
    const handler = () => setShowModuleManager(true);
    window.addEventListener("open-module-manager", handler);
    return () => window.removeEventListener("open-module-manager", handler);
  }, []);

  return {
    showShortcuts,
    setShowShortcuts,
    searchOpen,
    setSearchOpen,
    showModuleManager,
    setShowModuleManager,
    showCierreDiario,
    setShowCierreDiario,
    showChangelog,
    setShowChangelog,
  };
}
