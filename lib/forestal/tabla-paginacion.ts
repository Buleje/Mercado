/**
 * tabla-paginacion.ts — cuántas filas se ven y en qué página (ADR-344).
 *
 * Las tablas del libro crecen sin techo: un patio de mil trozas o una Sección 2
 * de un trimestre entero se dibujaban completas y el navegador pintaba miles de
 * filas que nadie iba a mirar. Paginar es lo que las vuelve usables — y la
 * cuenta de «mostrando 26–50 de 340» tiene que ser la misma en todas.
 *
 * PURO y client-safe: el hook de React vive en `components/.../ctp-tabla.tsx`,
 * acá está la aritmética, que es lo que se puede probar.
 */

/** Las opciones del selector. «Todas» es 0 — hay tablas que se imprimen. */
export const FILAS_POR_PAGINA = [25, 50, 100, 0] as const;
export const FILAS_POR_PAGINA_DEFAULT = 25;

export function etiquetaFilasPorPagina(n: number): string {
  return n === 0 ? "Todas" : `${n} por página`;
}

export interface RangoPagina {
  /** Página normalizada (0-based) — nunca fuera del rango real. */
  pagina: number;
  paginas: number;
  /** Primera y última fila mostradas, 1-based y listas para el rótulo. */
  desde: number;
  hasta: number;
  total: number;
  /** Índices para cortar el array. */
  inicio: number;
  fin: number;
}

/**
 * Qué se ve con este total, este tamaño y esta página.
 *
 * **La página se acota siempre**: un filtro que achica la lista dejaba al
 * operador en la página 7 de una tabla que ahora tiene 2 —una pantalla vacía sin
 * explicación—. Acá vuelve sola a la última página con filas.
 */
export function rangoDePagina(total: number, porPagina: number, paginaPedida: number): RangoPagina {
  const t = Math.max(0, Math.trunc(total));
  // `porPagina = 0` = todas: una sola página con todo.
  const tam = porPagina > 0 ? Math.trunc(porPagina) : Math.max(t, 1);
  const paginas = Math.max(1, Math.ceil(t / tam));
  const pagina = Math.min(Math.max(0, Math.trunc(paginaPedida)), paginas - 1);
  const inicio = pagina * tam;
  const fin = Math.min(inicio + tam, t);
  return {
    pagina,
    paginas,
    total: t,
    inicio,
    fin,
    desde: t === 0 ? 0 : inicio + 1,
    hasta: fin,
  };
}

/**
 * Los números que se dibujan: primera, última, la actual con sus vecinas, y
 * `null` donde va el «…».
 *
 * Con 40 páginas no se pintan 40 botones; con 5, se pintan las 5 (esconder algo
 * que entra es peor que mostrarlo).
 */
export function numerosDePagina(paginas: number, actual: number, ventana = 1): (number | null)[] {
  if (paginas <= 1) return [0];
  const set = new Set<number>([0, paginas - 1]);
  for (let i = actual - ventana; i <= actual + ventana; i += 1) {
    if (i >= 0 && i < paginas) set.add(i);
  }
  const ordenadas = [...set].sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  let previa: number | null = null;
  for (const n of ordenadas) {
    if (previa != null && n - previa > 1) salida.push(null);
    salida.push(n);
    previa = n;
  }
  return salida;
}

/** «Mostrando 26–50 de 340 trozas» — el rótulo, con su plural. */
export function rotuloRango(r: RangoPagina, sustantivo: string, plural?: string): string {
  const nombre = r.total === 1 ? sustantivo : (plural ?? `${sustantivo}s`);
  if (r.total === 0) return `Sin ${plural ?? `${sustantivo}s`}`;
  if (r.desde === 1 && r.hasta === r.total) return `${r.total} ${nombre}`;
  return `Mostrando ${r.desde}–${r.hasta} de ${r.total} ${nombre}`;
}
