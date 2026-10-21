/**
 * Forma del menú lateral del panel: por categorías (acordeón) o con todos los
 * enlaces a la vista (Brandon 2026-10-20: «quitar la categoría Inicio que
 * despliega otros y poner visibles Inicio, Asistente IA, Metas…»).
 *
 * El modo «enlaces» NO arma pseudo-categorías (el modo «suelto» de 2026-05-29
 * las armaba con ids `flat:<tab>` y dejó el menú sin un solo encabezado): sigue
 * recorriendo las categorías reales, en el orden del usuario, y sólo cambia
 * cómo se dibujan. Qué pestañas entran lo decide `tabsDeCategoria` del sidebar,
 * la misma regla del acordeón.
 */
import React from "react";

export type ModoMenu = "categorias" | "enlaces";

export const CLAVE_MODO_MENU = "admin-sidebar-nav-mode";
/** Avisa a los otros menús montados (el del celular) que el guardado cambió. */
export const EVENTO_MODO_MENU = "admin-sidebar-nav-mode-change";

export function esModoMenu(v: unknown): v is ModoMenu {
  return v === "categorias" || v === "enlaces";
}

export function leerModoMenu(): ModoMenu {
  if (typeof window === "undefined") return "categorias";
  try {
    const v = localStorage.getItem(CLAVE_MODO_MENU);
    return esModoMenu(v) ? v : "categorias";
  } catch {
    return "categorias";
  }
}

export function guardarModoMenu(modo: ModoMenu): void {
  try {
    localStorage.setItem(CLAVE_MODO_MENU, modo);
    window.dispatchEvent(new CustomEvent(EVENTO_MODO_MENU, { detail: { modo } }));
  } catch {
    /* localStorage bloqueado: el modo vive sólo en esta pestaña */
  }
}

function suscribir(avisar: () => void): () => void {
  const alGuardar = (e: StorageEvent) => {
    if (e.key === CLAVE_MODO_MENU) avisar();
  };
  window.addEventListener(EVENTO_MODO_MENU, avisar);
  window.addEventListener("storage", alGuardar);
  return () => {
    window.removeEventListener(EVENTO_MODO_MENU, avisar);
    window.removeEventListener("storage", alGuardar);
  };
}

/** El modo GUARDADO (no el borrador del configurador): para el menú del celular. */
export function useModoMenuGuardado(): ModoMenu {
  return React.useSyncExternalStore(suscribir, leerModoMenu, () => "categorias");
}

export interface GrupoDeEnlaces {
  categoriaId: string;
  visibles: string[];
  pronto: string[];
  /** Línea fina antes del grupo, sin título. */
  separadorAntes: boolean;
}

/**
 * Las categorías como grupos de enlaces sueltos. Una categoría sin nada que
 * mostrar no aparece. Las de un solo enlace seguidas van juntas (una línea por
 * cada enlace sería otra pared); la línea va donde empieza o termina un grupo
 * de varios, o donde empieza una sección (`SECTION_BEFORE`).
 */
export function gruposDeEnlaces(
  categorias: readonly { id: string; tabs: readonly string[] }[],
  tabsDeCategoria: (c: { tabs: readonly string[] }) => { visible: string[]; comingSoon: string[] },
  empiezaSeccion: (categoriaId: string) => boolean,
): GrupoDeEnlaces[] {
  const grupos: GrupoDeEnlaces[] = [];
  let anteriorEraVarios = false;
  for (const cat of categorias) {
    const { visible, comingSoon } = tabsDeCategoria(cat);
    const total = visible.length + comingSoon.length;
    if (total === 0) continue;
    const varios = total > 1;
    grupos.push({
      categoriaId: cat.id,
      visibles: visible,
      pronto: comingSoon,
      separadorAntes: grupos.length > 0 && (varios || anteriorEraVarios || empiezaSeccion(cat.id)),
    });
    anteriorEraVarios = varios;
  }
  return grupos;
}
