/**
 * Rótulo chico que va arriba del título de una pestaña («Operaciones · Ventas»),
 * sacado del MISMO menú lateral que el usuario acaba de tocar.
 *
 * La referencia (Libro TH › GTF) tiene rótulo + título; los 19 hubs con
 * `AdminTabBar heading` no tenían ninguno. En vez de escribir 23 rótulos a mano
 * se arma con la sección y la categoría del menú, sin repetir el título: el
 * rótulo «Abastecimiento · Compras» sobre «Compras» se había sacado justamente
 * por decir lo mismo dos veces.
 */
import { CONFIG_MODULE, SECTION_BEFORE, TAB_CATEGORIES, type TabCategory } from "@/app/admin/_lib/tab-categories";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "y")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Categoría del menú y la sección que la encabeza, en el orden del menú. */
function ubicarEnMenu(
  tab: string,
  categorias: readonly TabCategory[],
  secciones: Readonly<Record<string, string>>,
): { seccion?: string; categoria: string } | null {
  let seccion: string | undefined;
  for (const c of categorias) {
    if (secciones[c.id]) seccion = secciones[c.id];
    if ((c.tabs as readonly string[]).includes(tab)) return { seccion, categoria: c.label };
  }
  return null;
}

export function rotuloDelMenu(
  tab: string | null | undefined,
  titulo: string,
  categorias: readonly TabCategory[] = [...TAB_CATEGORIES, CONFIG_MODULE],
  secciones: Readonly<Record<string, string>> = SECTION_BEFORE,
): string | undefined {
  if (!tab) return undefined;
  const lugar = ubicarEnMenu(tab, categorias, secciones);
  if (!lugar) return undefined;
  const t = normalizar(titulo);
  const partes: string[] = [];
  for (const p of [lugar.seccion, lugar.categoria]) {
    if (!p) continue;
    const n = normalizar(p);
    // Fuera lo que el título ya dice («Compras» sobre «Compras») y lo repetido.
    if (n === t || partes.some((q) => normalizar(q) === n)) continue;
    partes.push(p);
  }
  return partes.length ? partes.join(" · ") : undefined;
}
