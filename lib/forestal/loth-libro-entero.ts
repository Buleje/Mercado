/**
 * loth-libro-entero.ts — leer el Libro LO-TH ENTERO, página por página.
 *
 * La lectura del libro (`ForestLothDB.list`) devuelve como mucho 500 líneas por
 * llamada. El impreso y el Excel pedían una sola página: un libro de 650 líneas
 * se declaraba ante SERFOR con 500 y nada lo decía (RDE 264-2019 pide el libro
 * completo). La pantalla ya había dejado de cortar (`LothLibroOperaciones`,
 * vista de trazabilidad); esto es esa misma lectura, en un solo lugar, para el
 * servidor (Excel) y para el navegador (impreso).
 *
 * El tope de páginas es una red de seguridad, no un límite real: si alguna vez
 * se alcanza, `truncado` lo dice y el documento lo imprime («Se muestran N de
 * M»). Un libro cortado en silencio es peor que uno que avisa que falta algo.
 *
 * Isomorfo: ni `lib/db` ni `fetch` — cada lado pasa cómo lee una página.
 */
import { formatNumber } from "@/lib/format";

/** Líneas por página: la misma que admite la lectura del libro. */
export const LOTH_LINEAS_POR_PAGINA = 500;
/** 40 páginas = 20.000 líneas. Red de seguridad contra un bucle sin fin. */
export const LOTH_TOPE_PAGINAS = 40;

export interface PaginaDelLibro<T> {
  entries: T[];
  /** Cuántas líneas tiene el libro con el mismo filtro (no sólo esta página). */
  total: number;
}

export interface LibroEntero<T> {
  entries: T[];
  /** Las líneas que tiene el libro según el servidor. */
  total: number;
  /** Se leyeron menos líneas que las que tiene el libro. */
  truncado: boolean;
}

/**
 * Lee todas las páginas hasta completar `total`.
 *
 * Sale cuando una página viene incompleta, cuando ya se juntaron `total`
 * líneas o al llegar al tope. Si una línea aparece dos veces (el libro cambió
 * entre dos páginas) se cuenta una: la clave es su `id`.
 */
export async function leerLibroEntero<T extends { id?: unknown }>(
  leerPagina: (offset: number, limit: number) => Promise<PaginaDelLibro<T>>,
  opts: { porPagina?: number; topePaginas?: number } = {},
): Promise<LibroEntero<T>> {
  const porPagina = opts.porPagina ?? LOTH_LINEAS_POR_PAGINA;
  const tope = opts.topePaginas ?? LOTH_TOPE_PAGINAS;
  const vistas = new Set<string>();
  const entries: T[] = [];
  let total = 0;
  for (let p = 0; p < tope; p++) {
    const pagina = await leerPagina(p * porPagina, porPagina);
    const lote = pagina.entries ?? [];
    total = Number.isFinite(pagina.total) ? Number(pagina.total) : entries.length + lote.length;
    for (const e of lote) {
      const id = typeof e.id === "string" ? e.id : null;
      if (id) {
        if (vistas.has(id)) continue;
        vistas.add(id);
      }
      entries.push(e);
    }
    if (lote.length < porPagina || entries.length >= total) break;
  }
  return { entries, total: Math.max(total, entries.length), truncado: entries.length < total };
}

/**
 * La frase que va en el impreso y en el Excel cuando el libro no entró entero.
 * `null` cuando está completo: un libro completo no lleva leyenda.
 */
export function avisoLibroIncompleto(l: { mostradas: number; total: number }): string | null {
  if (l.mostradas >= l.total) return null;
  return `Se muestran ${formatNumber(l.mostradas, 0)} de ${formatNumber(l.total, 0)} líneas del libro: este documento NO está completo.`;
}
