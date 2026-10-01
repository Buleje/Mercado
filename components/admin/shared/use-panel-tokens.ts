"use client";

/**
 * Los tokens del PANEL para lo que se pinta fuera de él (modales en portal).
 *
 * Un modal de Radix se monta al final de `<body>`, fuera del árbol del panel.
 * Ahí los tokens son los de la raíz —los de la tienda— y no los del preset del
 * admin, que viven como estilo inline en el wrapper de `DesignTokensProvider` y
 * en las reglas `[data-area="admin"]` de globals.css. Medido 2026-09-12 con la
 * hoja de atajos abierta sobre Productos: en claro el diálogo compartía **1 de
 * 8** tokens con la pantalla de atrás — acento coral en vez de teal, grises
 * neutros en vez de pizarra, «advertencia» coral en vez de ámbar, «éxito» teal
 * en vez de verde—; en oscuro, 5 de 8. El modal se leía como de otro sistema.
 *
 * El hook anterior (`useAdminAccent`) copiaba 4 variables de acento buscando el
 * wrapper entre los hijos directos de `<body>`, y ni eso llegaba (el acento
 * medido dentro del diálogo seguía coral).
 *
 * Se leen del ELEMENTO del panel, no de `:root`: el valor de un token depende
 * de dónde se mide (ver memoria tokens-se-resuelven-por-contexto).
 */

import { useEffect, useState, type CSSProperties } from "react";

/** Familias de tokens que definen cómo se ve el panel. */
const FAMILIAS = /^--(accent|surface|text|rule|data|color-primary|brand-primary|font|ts|fw|ls|radius|shadow|btn)(-|$)/;

/** Los semánticos que el tema oscuro redefine por regla (no por estilo inline). */
const BASE = [
  "--surface-canvas", "--surface-raised", "--surface-sunken",
  "--text-primary", "--text-secondary", "--text-tertiary",
  "--rule-soft", "--rule-base", "--rule-strong",
  ...["success", "warning", "error", "info"].flatMap((t) =>
    ["", "-50", "-100", "-500", "-600", "-700"].map((s) => `--data-${t}${s}`),
  ),
];

function nombresInline(el: Element | null | undefined): string[] {
  const style = el?.getAttribute("style") ?? "";
  return [...style.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

export function usePanelTokens(open: boolean): CSSProperties {
  const [vars, setVars] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const panel = document.querySelector<HTMLElement>('[data-area="admin"]');
    if (!panel) return;
    /* El wrapper del provider es el ancestro que lleva el preset inline. */
    let wrapper: HTMLElement | null = panel.parentElement;
    while (wrapper && !(wrapper.getAttribute("style") ?? "").includes("--accent")) wrapper = wrapper.parentElement;

    const nombres = new Set([...BASE, ...nombresInline(wrapper)].filter((n) => FAMILIAS.test(n)));
    const cs = getComputedStyle(panel);
    const next: Record<string, string> = {};
    for (const n of nombres) {
      const val = cs.getPropertyValue(n).trim();
      if (val) next[n] = val;
    }
    setVars(next as CSSProperties);
  }, [open]);
  return vars;
}
