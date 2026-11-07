/**
 * Orden y paginado del listado de adelantos.
 *
 * La tabla no ordenaba por nada y mostraba TODAS las filas: con 39 ya era un
 * muro, y un negocio de dos años tiene cientos. Ordenar y paginar son la misma
 * pregunta —«mostrame los N que me importan primero»— así que viven juntos y
 * fuera del componente, donde se pueden testear sin montar React.
 */

import type { DbAdelanto } from "@/lib/db/adelantos.db";

export const COLUMNAS_ORDENABLES = ["fecha", "persona", "codigo", "monto", "saldo", "avance", "estado"] as const;
export type ColumnaOrden = (typeof COLUMNAS_ORDENABLES)[number];
export type Direccion = "asc" | "desc";

/** Cuánto se liquidó, de 0 a 100. Un adelanto de S/ 0 no tiene avance que medir. */
export function avanceDe(a: DbAdelanto): number {
  if (!(a.montoAdelantado > 0)) return 0;
  const entregado = a.montoAdelantado - a.saldoPendiente;
  return Math.min(100, Math.max(0, Math.round((entregado / a.montoAdelantado) * 100)));
}

/** Orden de los estados para la columna «Estado»: primero lo que hay que atender. */
const PESO_ESTADO: Record<string, number> = { ABIERTO: 0, EXCEDIDO: 1, LIQUIDADO: 2, CANCELADO: 3 };

function valorDe(a: DbAdelanto, col: ColumnaOrden): number | string {
  switch (col) {
    case "fecha": return new Date(a.fechaAdelanto).getTime();
    case "persona": return (a.beneficiario?.nombre ?? "").toLowerCase();
    /* Los códigos son «ADL-2026-0009»: comparados como texto ordenan bien
       porque el correlativo va con ceros a la izquierda. Los que no tienen
       código van al final en vez de mezclarse arriba con la cadena vacía. */
    case "codigo": return a.codigoOperacion ?? "￿";
    case "monto": return a.montoAdelantado;
    case "saldo": return a.saldoPendiente;
    case "avance": return avanceDe(a);
    case "estado": return PESO_ESTADO[a.status] ?? 99;
  }
}

/**
 * Ordena sin mutar. El desempate SIEMPRE es por fecha descendente: sin él, dos
 * filas con el mismo saldo bailan de lugar entre renders y la lista parpadea.
 */
export function ordenarAdelantos(
  adelantos: readonly DbAdelanto[],
  columna: ColumnaOrden,
  direccion: Direccion,
): DbAdelanto[] {
  const signo = direccion === "asc" ? 1 : -1;
  return [...adelantos].sort((x, y) => {
    const vx = valorDe(x, columna);
    const vy = valorDe(y, columna);
    if (vx !== vy) {
      const cmp = typeof vx === "string" && typeof vy === "string" ? vx.localeCompare(vy, "es") : Number(vx) - Number(vy);
      return cmp * signo;
    }
    return new Date(y.fechaAdelanto).getTime() - new Date(x.fechaAdelanto).getTime();
  });
}

/** Al tocar una columna: la misma invierte el sentido, otra arranca de cero. */
export function siguienteOrden(
  actual: { columna: ColumnaOrden; direccion: Direccion },
  columna: ColumnaOrden,
): { columna: ColumnaOrden; direccion: Direccion } {
  if (actual.columna === columna) return { columna, direccion: actual.direccion === "asc" ? "desc" : "asc" };
  /* Texto se lee de la A a la Z; números y fechas, de mayor a menor — lo grande
     y lo reciente es lo que se busca primero. */
  return { columna, direccion: columna === "persona" || columna === "codigo" ? "asc" : "desc" };
}

export type Pagina<T> = {
  items: T[];
  /** 1-indexada, ya acotada al rango válido. */
  pagina: number;
  totalPaginas: number;
  desde: number;
  hasta: number;
  total: number;
};

/**
 * Corta una página. Acota el número pedido en vez de devolver vacío: si alguien
 * está en la página 5 y filtra hasta que quedan 12 resultados, tiene que ver los
 * 12 — no una tabla en blanco que parece un bug.
 */
export function paginar<T>(items: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const inicio = (p - 1) * porPagina;
  return {
    items: items.slice(inicio, inicio + porPagina) as T[],
    pagina: p,
    totalPaginas,
    desde: total === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, total),
    total,
  };
}
