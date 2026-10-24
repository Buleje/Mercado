/**
 * «Más usadas» del menú de accesos directos (Brandon 24-10): las páginas que
 * esta persona más abre, sacadas del contador de «Menú en tu orden»
 * (`orden-por-uso.ts`, claves «tab:vista»). Puro: el hook que lee el contador
 * y el menú que lo dibuja viven en `components/admin/header/`.
 */

import { CLAVE_DESDE, type ContadorDeUso } from "@/lib/admin/orden-por-uso";
import { entradaDeUrl, type Reciente } from "@/lib/admin/recientes-panel";

export const TOPE_MAS_USADAS = 8;

export interface MasUsada {
  href: string;
  titulo: string;
  camino: string;
  /** El `?tab=` (para buscar su ícono). */
  tab: string;
  n: number;
  ultima: number;
}

/**
 * El top por cantidad de aperturas (empate: la más reciente, luego el nombre).
 * Las claves que apuntan al mismo lugar (una vista que ya no existe cae a su
 * pestaña) se suman. `fuera` = lugares a no ofrecer (donde ya estás).
 */
export function masUsadas(
  contador: ContadorDeUso | null,
  etiquetaTab: (tab: string) => string | null,
  fuera: readonly (string | null)[] = [],
  tope = TOPE_MAS_USADAS,
): MasUsada[] {
  if (!contador) return [];
  const porLugar = new Map<string, MasUsada>();
  for (const [clave, uso] of Object.entries(contador)) {
    if (clave === CLAVE_DESDE || uso.n < 1) continue;
    const corte = clave.indexOf(":");
    const tab = corte < 0 ? clave : clave.slice(0, corte);
    const vista = corte < 0 ? "" : clave.slice(corte + 1);
    const q = new URLSearchParams({ tab });
    if (vista) q.set("vista", vista);
    const e = entradaDeUrl(`/admin?${q.toString()}`, etiquetaTab);
    if (!e) continue;
    const previa = porLugar.get(e.href);
    if (previa) {
      previa.n += uso.n;
      previa.ultima = Math.max(previa.ultima, uso.ultima);
    } else {
      porLugar.set(e.href, { href: e.href, titulo: e.titulo, camino: e.camino, tab, n: uso.n, ultima: uso.ultima });
    }
  }
  const ocultos = new Set(fuera.filter((h): h is string => Boolean(h)));
  return [...porLugar.values()]
    .filter((m) => !ocultos.has(m.href))
    .sort((a, b) => b.n - a.n || b.ultima - a.ultima || a.titulo.localeCompare(b.titulo, "es"))
    .slice(0, tope);
}

/** Los recientes sin lo que ya salió en «Más usadas». */
export function recientesSinRepetidos(recientes: readonly Reciente[], usadas: readonly MasUsada[]): Reciente[] {
  const ya = new Set(usadas.map((m) => m.href));
  return recientes.filter((r) => !ya.has(r.href));
}
