/**
 * En qué orden se ven los pedidos de la Lista (`?vista=lista`): la cabeza de
 * cada columna ordena. El tablero no ordena por columna: dentro de cada estado
 * va primero el que más espera (`masEsperaPrimero`).
 *
 * Sin React: se prueba sola (`__tests__/pedidos-orden-y-espera.test.ts`).
 */
import type { DbOrder } from "@/lib/jsondb";
import { ESTADOS_EN_MARCHA } from "./filtrar-pedidos";
import { entroAlEstado } from "./tiempo-en-estado";

export type ColumnaOrden = "cliente" | "estado" | "espera" | "fecha" | "total";
export type Sentido = "asc" | "desc";
export interface Orden {
  columna: ColumnaOrden;
  sentido: Sentido;
}

/** Como llegan: lo más nuevo arriba. */
export const ORDEN_INICIAL: Orden = { columna: "fecha", sentido: "desc" };

/** Al tocar una cabeza nueva, el sentido que primero sirve (la espera, de más a menos). */
export const SENTIDO_PRIMERO: Record<ColumnaOrden, Sentido> = {
  cliente: "asc",
  estado: "asc",
  espera: "desc",
  fecha: "desc",
  total: "desc",
};

const posicionDelEstado = (s: string) => {
  const i = (ESTADOS_EN_MARCHA as readonly string[]).indexOf(s);
  return i === -1 ? ESTADOS_EN_MARCHA.length : i;
};

function comparar(a: DbOrder, b: DbOrder, columna: ColumnaOrden): number {
  switch (columna) {
    case "cliente":
      return a.customer.name.localeCompare(b.customer.name, "es", { sensitivity: "base" });
    case "estado":
      return posicionDelEstado(a.status) - posicionDelEstado(b.status);
    /* Más espera = entró antes al estado: el sentido «desc» pone primero al más viejo. */
    case "espera":
      return entroAlEstado(b) - entroAlEstado(a);
    case "fecha":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "total":
      return Number(a.total) - Number(b.total);
  }
}

/** Copia ordenada (estable: los empates quedan como llegaron). */
export function ordenarPedidos(pedidos: readonly DbOrder[], orden: Orden): DbOrder[] {
  const signo = orden.sentido === "asc" ? 1 : -1;
  return pedidos
    .map((p, i) => ({ p, i }))
    .sort((x, y) => signo * comparar(x.p, y.p, orden.columna) || x.i - y.i)
    .map(({ p }) => p);
}

/** Tocar la misma cabeza da vuelta el sentido; otra, arranca en su sentido útil. */
export function siguienteOrden(actual: Orden, columna: ColumnaOrden): Orden {
  if (actual.columna === columna)
    return { columna, sentido: actual.sentido === "asc" ? "desc" : "asc" };
  return { columna, sentido: SENTIDO_PRIMERO[columna] };
}
