/**
 * En qué orden se ven los pedidos de la Lista (`?vista=lista`): la cabeza de
 * cada columna ordena con la pieza común (`useOrdenColumna`, modo controlado:
 * el orden vive en `usePedidos` porque lo guardan las vistas y lo sigue la
 * hoja impresa). El tablero no ordena por columna: dentro de cada estado va
 * primero el que más espera (`masEsperaPrimero`).
 *
 * Sin React: se prueba sola (`__tests__/pedidos-orden-y-espera.test.ts`).
 */
import type { AccesorOrden, OrdenFijo } from "@/components/admin/shared/use-orden-columna";
import type { DbOrder } from "@/lib/jsondb";
import { plataSinMonto } from "./columnas-filtro-archivados";
import { ESTADOS_EN_MARCHA } from "./filtrar-pedidos";
import { cobroDe } from "./siguiente-paso";
import { entroAlEstado } from "./tiempo-en-estado";

export type ColumnaOrden = "cliente" | "estado" | "espera" | "fecha" | "total" | "plata";
export type Sentido = "asc" | "desc";
/** Lo que guardan las vistas (`{columna, sentido}`); el hook lo ve como `{id, direccion}`. */
export interface Orden {
  columna: ColumnaOrden;
  sentido: Sentido;
}

/** Como llegan: lo más nuevo arriba. También a donde vuelve el tercer clic. */
export const ORDEN_INICIAL: Orden = { columna: "fecha", sentido: "desc" };

export const aOrdenFijo = (o: Orden): OrdenFijo => ({ id: o.columna, direccion: o.sentido });
export const deOrdenFijo = (v: OrdenFijo | null): Orden =>
  v ? { columna: v.id as ColumnaOrden, sentido: v.direccion } : ORDEN_INICIAL;

const posicionDelEstado = (s: string) => {
  const i = (ESTADOS_EN_MARCHA as readonly string[]).indexOf(s);
  return i === -1 ? ESTADOS_EN_MARCHA.length : i;
};

/**
 * Primer clic: cliente y estado de la A a la Z; «Sin avanzar», fecha y total de
 * mayor a menor. «Sin avanzar» desc = el que más espera primero: por eso el
 * valor es el tiempo de espera (negativo de cuándo entró al estado).
 */
export const ORDEN_PEDIDOS: Record<ColumnaOrden, AccesorOrden<DbOrder>> = {
  cliente: { valor: (o) => o.customer.name, texto: true },
  estado: { valor: (o) => posicionDelEstado(o.status), texto: true },
  espera: { valor: (o) => -entroAlEstado(o) },
  fecha: { valor: (o) => new Date(o.createdAt).getTime() },
  total: { valor: (o) => Number(o.total) },
  plata: { valor: (o) => plataSinMonto(cobroDe(o).texto), texto: true },
};
