"use client";

/**
 * app/admin/_hooks/useKeyboardShortcuts.ts
 *
 * Hook que registra los atajos de teclado del panel admin.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Atajos:
 *  - Alt + 1..9 / 0  → navegar a tab principal
 *  - Ctrl/Cmd + K    → abrir búsqueda global
 *  - Alt + ?         → mostrar modal de shortcuts
 *  - Alt + T         → toggle tema claro/oscuro
 *  - Alt + S         → enfocar input de búsqueda del tab actual
 *  - Alt + L         → cerrar sesión
 *  - Ctrl + Shift + C → toggle cierre del día
 *  - Ctrl + Shift + P → toggle modo presentación
 *
 * Convenciones:
 *  - Ignora el evento si el foco está en un campo editable (input/textarea/
 *    select/contenteditable) o hay un modal abierto — vía `shouldIgnoreShortcut`
 *    helpers en lib/keyboard-guards (para no romper escritura ni sacar al
 *    usuario de un diálogo). Ver reporte QA Compras 2026-07-08.
 *  - Usa latest-ref pattern para evitar re-attach del listener en cada render.
 */

import { useEffect, useRef } from "react";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import type { Tab } from "../_lib/tabs.types";

const SHORTCUT_MAP: Record<string, Tab> = {
  "1": "asistente-ia",
  "2": "pedidos",
  "3": "inventario",
  "4": "productos",
  "5": "compras",
  "6": "plata",
  "7": "clientes",
  "8": "fiados",
  "9": "config",
  "0": "plan",
};

export interface KeyboardShortcutsConfig {
  navigateTab: (id: Tab) => void;
  toggleTheme: () => void;
  handleLogout: () => void | Promise<void>;
  setSearchOpen: (updater: (prev: boolean) => boolean) => void;
  setShowShortcuts: (updater: (prev: boolean) => boolean) => void;
  setShowCierreDiario: (updater: (prev: boolean) => boolean) => void;
  setPresentationMode: (updater: (prev: boolean) => boolean) => void;
}

/**
 * Registra el listener global de atajos de teclado del admin.
 * Usa latest-ref pattern: el listener se monta una sola vez y siempre lee
 * los handlers más recientes vía ref, evitando re-attach por cada cambio
 * de prop.
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // FIX 2026-07-08 (reporte QA): guard ampliado — antes solo INPUT/TEXTAREA;
      // ahora también SELECT/contenteditable y CUALQUIER modal abierto, para que
      // Alt+1..9 no saque al usuario de su sección mientras opera en un diálogo.
      if (isEditableTarget(e.target) || isModalOpen()) return;

      const c = configRef.current;

      if (e.altKey && SHORTCUT_MAP[e.key]) {
        e.preventDefault();
        c.navigateTab(SHORTCUT_MAP[e.key]);
        return;
      }

      // Ctrl/Cmd + K → búsqueda global
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        c.setSearchOpen((v) => !v);
        return;
      }

      // Alt + ? → modal de shortcuts
      if (e.key === "?" && e.altKey) {
        e.preventDefault();
        c.setShowShortcuts((v) => !v);
        return;
      }

      // Alt + T → toggle tema
      if (e.key === "t" && e.altKey) {
        e.preventDefault();
        c.toggleTheme();
        return;
      }

      // Alt + S → enfocar input de búsqueda
      if (e.key === "s" && e.altKey) {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[type="text"][placeholder*="Buscar"], input[type="search"]'
        ) as HTMLInputElement | null;
        searchInput?.focus();
        return;
      }

      // Alt + L → logout
      if (e.key === "l" && e.altKey) {
        e.preventDefault();
        void c.handleLogout();
        return;
      }

      // Ctrl + Shift + C → cierre del día
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        c.setShowCierreDiario((v) => !v);
        return;
      }

      // Ctrl + Shift + P → modo presentación
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        c.setPresentationMode((v) => !v);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
