"use client";

/**
 * ModuleDepth — cuántos encabezados de módulo hay ARRIBA del que se está por
 * dibujar.
 *
 * El problema que resuelve (medido 2026-09-07 en `?tab=analytics-pro`):
 * un hub dibuja su `AdminModuleHeader` (39px, Instrument Serif) + su barra de
 * pestañas, y el módulo hijo que carga adentro dibuja OTRO `AdminModuleHeader`
 * del mismo tamaño + su propia barra. Resultado: 340px de encabezados y
 * pestañas antes del primer dato, sobre un viewport de 493px — 69% de la
 * pantalla gastada en decir dos veces dónde estás.
 *
 * La profundidad no se pasa a mano por 40 sitios de llamada: `AdminTabBar`
 * la incrementa alrededor de su panel. La invariante que lo hace válido está
 * verificada sobre los 32 hubs del panel — todos tienen exactamente UN
 * `<AdminModuleHeader>` y siempre ANTES de su `<AdminTabBar>`, nunca adentro.
 * Entonces: header dentro del panel de un tab bar ⇒ ya hay un título arriba.
 *
 * Efectos en `AdminModuleHeader`:
 *   depth 0 → editorial completo (h1)
 *   depth ≥1 → línea compacta (h2/h3), sin eyebrow ni borde
 */

import { createContext, useContext, type ReactNode } from "react";

const ModuleDepthContext = createContext(0);

/** Profundidad actual. 0 = este módulo es el dueño de la página. */
export function useModuleDepth(): number {
  return useContext(ModuleDepthContext);
}

/**
 * Suma un nivel para todo lo que se dibuje adentro.
 *
 * Lo usa `AdminTabBar` sobre su panel. Si algún día hace falta anidar un
 * módulo sin tab bar de por medio, se puede envolver a mano.
 */
export function ModuleDepthProvider({ children }: { children: ReactNode }) {
  const depth = useContext(ModuleDepthContext);
  return (
    <ModuleDepthContext.Provider value={depth + 1}>
      {children}
    </ModuleDepthContext.Provider>
  );
}

/**
 * Vuelve a poner el contador en 0.
 *
 * Para superficies que se abren ENCIMA del árbol (modales, drawers, portales)
 * y arrancan pantalla nueva: ahí el título sí manda, aunque en el árbol de
 * React cuelguen del panel de un tab.
 */
export function ModuleDepthReset({ children }: { children: ReactNode }) {
  return (
    <ModuleDepthContext.Provider value={0}>
      {children}
    </ModuleDepthContext.Provider>
  );
}
