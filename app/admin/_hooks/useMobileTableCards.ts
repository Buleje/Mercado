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
      // Un <th> puede decir cómo se llama con `data-label` propio. Y si lleva
      // un autofiltro de cabecera (Filtros tipo Excel, 2026-09-22: `<details>`
      // con la lista de casillas, o un `<select>`), el texto de ESOS controles
      // no es el nombre de la columna: sin sacarlos, la card mobile rotulaba
      // «PROVEEDORTODOSZZ PROV BACKFILL (BORRAR)3…» (medido a 400px).
      const propio = cell.getAttribute("data-label");
      if (propio?.trim()) return propio.trim();
      const clon = cell.cloneNode(true) as Element;
      clon.querySelectorAll("details, select, input, textarea").forEach((n) => n.remove());
      const text = (clon.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return text;
      const aria = cell.getAttribute("aria-label");
      if (aria) return aria.trim();
      const title = cell.getAttribute("title");
      if (title) return title.trim();
      const inner = cell.querySelector<HTMLElement>("[aria-label], [title]");
      if (inner)
        return (inner.getAttribute("aria-label") || inner.getAttribute("title") || "").trim();
      return "";
    };

    /* Cuántas columnas REALES ocupa una celda — 1 si no tiene `colspan`. */
    const columnasDe = (cell: Element): number => {
      const raw = cell instanceof HTMLTableCellElement ? cell.colSpan : Number(cell.getAttribute("colspan") ?? 1);
      return Number.isFinite(raw) && raw > 0 ? raw : 1;
    };

    const applyMobileTableCards = () => {
      const tables = root.querySelectorAll("table");
      tables.forEach((table) => {
        const headerCells = Array.from(table.querySelectorAll("thead th"));
        /* Un `<th colSpan={2}>` ocupa DOS columnas reales — sin expandir,
           todo lo que viene después del primer header que abarca más de una
           columna queda corrido (bug medido en «Lo ganado», QA 400px:
           `<th colSpan={4}>Total</th>` corría el rótulo de las 3 columnas
           siguientes). */
        const labels: string[] = [];
        headerCells.forEach((th) => {
          const label = headerLabel(th);
          for (let i = 0; i < columnasDe(th); i++) labels.push(label);
        });

        /* `tfoot` también: una fila de totales sin etiquetas es cinco cifras
           sueltas en el celular (auditoría 2026-09-06, tabla de lotes de Saldos). */
        table.querySelectorAll("tbody tr, tfoot tr").forEach((row) => {
          let col = 0;
          Array.from(row.children).forEach((cell) => {
            if (!(cell instanceof HTMLElement)) return;
            const span = columnasDe(cell);
            /* Una celda que ABARCA varias columnas (ej. «Total» con
               colSpan={4}) no toma prestado el rótulo de la primera — su
               propio texto ya se explica; heredar uno sería, en el mejor
               caso, incompleto. */
            const label = span === 1 ? (labels[col] ?? "") : "";
            if (label) cell.dataset.label = label;
            else delete cell.dataset.label;
            col += span;
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
