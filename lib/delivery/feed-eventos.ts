/**
 * Feed de eventos del reparto (17-10, P18): «cada evento abre su pedido,
 * conserva fecha y actor, y diferencia GPS, acción humana y cálculo». Puro (sin
 * base ni React): lo usa `components/admin/DeliveryTab/FeedEventosReparto.tsx`
 * y lo prueba `__tests__/lib/delivery/feed-eventos.test.ts`.
 *
 * Agrupar NO borra la trazabilidad: cada grupo guarda TODOS sus eventos (el
 * panel los muestra al desplegar); sólo se juntan bajo su pedido.
 */

export interface EventoFeed {
  id: string;
  orderId: string;
  status: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  etaMinutes: number | null;
  actorType: string;
  createdAt: string;
  customerName?: string | null;
}

export type TipoActor = "gps" | "repartidor" | "negocio" | "cliente" | "sistema";

/** Quién o qué produjo el evento. Un evento del repartidor con coordenadas vino del GPS de su celular. */
export function actorDeEvento(e: Pick<EventoFeed, "actorType" | "lat" | "lng">): { tipo: TipoActor; rotulo: string } {
  if (e.actorType === "driver") {
    return e.lat != null && e.lng != null
      ? { tipo: "gps", rotulo: "GPS del repartidor" }
      : { tipo: "repartidor", rotulo: "App del repartidor" };
  }
  if (e.actorType === "admin") return { tipo: "negocio", rotulo: "Alguien del negocio" };
  if (e.actorType === "customer") return { tipo: "cliente", rotulo: "Cliente" };
  return { tipo: "sistema", rotulo: "Cálculo del sistema" };
}

export const ESTADOS_FEED_CERRADOS = ["delivered", "failed", "cancelled"] as const;
export const ESTADOS_FEED_FALLIDOS = ["failed", "cancelled"] as const;
/** Un pedido en camino sin novedad por más de esto pide que alguien lo mire. */
export const MINUTOS_SIN_NOVEDAD = 30;

const esCerrado = (s: string) => (ESTADOS_FEED_CERRADOS as readonly string[]).includes(s);
const esFallido = (s: string) => (ESTADOS_FEED_FALLIDOS as readonly string[]).includes(s);

export interface GrupoFeed {
  orderId: string;
  cliente: string | null;
  /** El evento más reciente: manda el estado del pedido. */
  ultimo: EventoFeed;
  /** Todos, del más reciente al más viejo (nada se descarta). */
  eventos: EventoFeed[];
  /** Eventos con el mismo estado que el anterior (pings de GPS repetidos, reintentos). */
  repetidos: number;
  cerrado: boolean;
  /** Por qué alguien tiene que mirarlo; `null` = va bien. */
  porAtender: string | null;
}

export type FiltroFeed = "atender" | "curso" | "cerrados" | "todos";

/** Agrupa por pedido, del movimiento más reciente al más viejo. */
export function agruparFeed(eventos: readonly EventoFeed[], ahora: Date = new Date()): GrupoFeed[] {
  const porPedido = new Map<string, EventoFeed[]>();
  for (const e of eventos) {
    const lista = porPedido.get(e.orderId);
    if (lista) lista.push(e);
    else porPedido.set(e.orderId, [e]);
  }
  const grupos: GrupoFeed[] = [];
  for (const [orderId, lista] of porPedido) {
    const orden = [...lista].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const ultimo = orden[0];
    let repetidos = 0;
    for (let i = 1; i < orden.length; i++) if (orden[i].status === orden[i - 1].status) repetidos++;
    const cerrado = esCerrado(ultimo.status);
    let porAtender: string | null = null;
    if (esFallido(ultimo.status)) {
      porAtender = ultimo.status === "failed" ? "No se pudo entregar" : "Se canceló en el camino";
    } else if (!cerrado) {
      const min = Math.floor((ahora.getTime() - Date.parse(ultimo.createdAt)) / 60_000);
      if (min > MINUTOS_SIN_NOVEDAD) porAtender = `Sin novedad hace ${min} min`;
    }
    grupos.push({
      orderId,
      cliente: orden.find((e) => e.customerName)?.customerName ?? null,
      ultimo,
      eventos: orden,
      repetidos,
      cerrado,
      porAtender,
    });
  }
  return grupos.sort((a, b) => Date.parse(b.ultimo.createdAt) - Date.parse(a.ultimo.createdAt));
}

export function filtrarFeed(grupos: readonly GrupoFeed[], filtro: FiltroFeed): GrupoFeed[] {
  if (filtro === "atender") return grupos.filter((g) => g.porAtender);
  if (filtro === "curso") return grupos.filter((g) => !g.cerrado);
  if (filtro === "cerrados") return grupos.filter((g) => g.cerrado);
  return [...grupos];
}

/**
 * Para el mapa y «Órdenes activas»: los eventos de los pedidos que siguen en
 * camino (su último evento no es entregado, fallido ni cancelado). El feed del
 * día trae también los cerrados.
 */
export function eventosDePedidosActivos<T extends Pick<EventoFeed, "orderId" | "status" | "createdAt">>(eventos: readonly T[]): T[] {
  const ultimo = new Map<string, T>();
  for (const e of eventos) {
    const prev = ultimo.get(e.orderId);
    if (!prev || Date.parse(e.createdAt) > Date.parse(prev.createdAt)) ultimo.set(e.orderId, e);
  }
  return eventos.filter((e) => !esCerrado(ultimo.get(e.orderId)?.status ?? ""));
}
