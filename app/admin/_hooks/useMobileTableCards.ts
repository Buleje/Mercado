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

    // Brandon 2026-05-28: si el <th> no tiene texto (solo ícono / checkbox),
    // intentamos aria-label → title → aria-label del primer descendiente
    // interactivo. Si NADA da texto, devolvemos "" y el CSS oculta el
    // ::before (antes ponía "Campo N" — labels inútiles en mobile).
    const headerLabel = (cell: Element): string => {
      const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return text;
      const aria = cell.getAttribute("aria-label");
      if (aria) return aria.trim();
      const title = cell.getAttribute("title");
      if (title) return title.trim();
      const inner = cell.querySelector<HTMLElement>("[aria-label], [title]");
      if (inner) return (inner.getAttribute("aria-label") || inner.getAttribute("title") || "").trim();
      return "";
    };

    const applyMobileTableCards = () => {
      const tables = root.querySelectorAll("table");
      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll("thead th"));
        const labels = headerCells.map(headerLabel);

        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (!(cell instanceof HTMLElement)) return;
            const label = labels[index] ?? "";
            if (label) cell.dataset.label = label;
            else delete cell.dataset.label;
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
