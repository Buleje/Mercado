"use client";

/**
 * app/admin/_hooks/useMobileTableCards.ts
 *
 * Hook que añade `data-label` a cada celda de las tablas del shell admin
 * para que el CSS responsive las pueda mostrar como tarjetas en mobile.
 *
 * Recorre todas las tablas dentro de `[data-admin-shell="true"]` y
 * en cada `<td>` añade un atributo `data-label` con el texto del `<th>`
 * correspondiente. Usa MutationObserver + resize listener para reaccionar
 * a cambios dinámicos.
 *
 * Re-corre cuando cambia `authReady` o `tab` (porque cargan tablas nuevas).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect } from "react";

export function useMobileTableCards(authReady: boolean, tab: string): void {
  useEffect(() => {
    const root = document.querySelector('[data-admin-shell="true"]');
    if (!root) return;

    const applyMobileTableCards = () => {
      const tables = root.querySelectorAll("table");
      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll("thead th"));
        const labels = headerCells.map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim()
        );

        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLElement)) return;
            cell.dataset.label = labels[index] || `Campo ${index + 1}`;
          });
        });
      });
    };

    const scheduleApply = () => window.requestAnimationFrame(applyMobileTableCards);
    scheduleApply();

    const observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleApply);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleApply);
    };
  }, [authReady, tab]);
}
