/**
 * Vistas de la Lista de pedidos (P08, 17-10): filtros + repartidor + orden
 * con un nombre. Cinco del sistema y las que cada quien guarda.
 *
 * Guardar, borrar, el tope y el menú son los de todo el panel
 * (`hooks/use-vistas-guardadas.ts` + `MenuVistasGuardadas`, M07): las
 * guardadas son POR USUARIO y negocio, en este navegador. `SavedFilter` (la
 * tabla de filtros guardados) es del negocio entero y cualquiera borra la de
 * otro: no sirve para esto. Que la vista siga al usuario a otro equipo pide
 * una columna `userId` → DECIDE BRANDON.
 *
 * Acá sólo lo propio de Pedidos: qué es una vista, cómo se pone y cuándo dos
 * son la misma («Pedidos de hoy» sigue siendo hoy mañana). Sin React ni
 * `window`: se prueba sola (`__tests__/pedidos-vistas.test.ts`).
 */
import type { VistaDelSistema } from "@/lib/admin/vistas-guardadas";
import type { OrderStatus } from "@/lib/jsondb";
import { ESTADOS_EN_MARCHA, SIN_REPARTIDOR } from "./filtrar-pedidos";
import { ORDEN_INICIAL, type ColumnaOrden, type Orden } from "./orden-pedidos";
import type { OrderFilters } from "./types";

/** Lo que guarda una vista: los filtros sin `Set` (van a JSON). */
export interface FiltrosDeVista {
  estados: OrderStatus[];
  pago: OrderFilters["paymentMethod"];
  origen: OrderFilters["source"];
  desde: string;
  hasta: string;
  minimo: string;
  maximo: string;
  busqueda: string;
  deuda: boolean;
  notas: boolean;
  /** Desde y hasta = el día de Lima en que se aplica (la vista «Pedidos de hoy»). */
  hoy: boolean;
  repartidor: string;
}

/** El estado de una vista de Pedidos: lo que `useVistasGuardadas` guarda. */
export interface EstadoVistaPedidos {
  filtros: FiltrosDeVista;
  orden: Orden;
}

const NADA: FiltrosDeVista = {
  estados: [],
  pago: "",
  origen: "",
  desde: "",
  hasta: "",
  minimo: "",
  maximo: "",
  busqueda: "",
  deuda: false,
  notas: false,
  hoy: false,
  repartidor: "",
};

const MAS_ESPERA: Orden = { columna: "espera", sentido: "desc" };

export const VISTA_ESTANDAR: VistaDelSistema<EstadoVistaPedidos> = {
  id: "estandar",
  nombre: "Estándar",
  ayuda: "Todos los pedidos en marcha, los más nuevos arriba",
  estado: { filtros: NADA, orden: ORDEN_INICIAL },
};

export const VISTAS_DEL_SISTEMA: readonly VistaDelSistema<EstadoVistaPedidos>[] = [
  VISTA_ESTANDAR,
  {
    id: "preparacion",
    nombre: "Preparación",
    ayuda: "Confirmados y en preparación, primero el que más espera",
    estado: { filtros: { ...NADA, estados: ["confirmado", "preparando"] }, orden: MAS_ESPERA },
  },
  {
    id: "hoy",
    nombre: "Pedidos de hoy",
    ayuda: "Los que entraron hoy (día de Lima)",
    estado: { filtros: { ...NADA, hoy: true }, orden: ORDEN_INICIAL },
  },
  {
    id: "por-cobrar",
    nombre: "Por cobrar",
    ayuda: "Los que se cobran al entregar, el más grande arriba",
    estado: { filtros: { ...NADA, deuda: true }, orden: { columna: "total", sentido: "desc" } },
  },
  {
    id: "sin-asignar",
    nombre: "Sin asignar",
    ayuda: "Confirmados o en preparación que todavía no tienen repartidor",
    estado: {
      filtros: { ...NADA, estados: ["confirmado", "preparando"], repartidor: SIN_REPARTIDOR },
      orden: MAS_ESPERA,
    },
  },
];

/** Los filtros y el repartidor que pone una vista, con «hoy» resuelto al día dado. */
export function aplicarVista(
  v: FiltrosDeVista,
  hoy: string,
): { filters: OrderFilters; repartidor: string } {
  return {
    filters: {
      statuses: new Set(v.estados),
      paymentMethod: v.pago,
      source: v.origen,
      dateFrom: v.hoy ? hoy : v.desde,
      dateTo: v.hoy ? hoy : v.hasta,
      amountMin: v.minimo,
      amountMax: v.maximo,
      customerSearch: v.busqueda,
      hasDebt: v.deuda,
      hasAdminNotes: v.notas,
    },
    repartidor: v.repartidor,
  };
}

/** Lo que se ve ahora, para guardarlo. Si las dos fechas son hoy, queda como «hoy» (mañana sigue siendo hoy). */
export function capturarVista(f: OrderFilters, repartidor: string, hoy: string): FiltrosDeVista {
  const esHoy = !!f.dateFrom && f.dateFrom === hoy && f.dateTo === hoy;
  return {
    estados: ESTADOS_EN_MARCHA.filter((s) => f.statuses.has(s)),
    pago: f.paymentMethod,
    origen: f.source,
    desde: esHoy ? "" : f.dateFrom,
    hasta: esHoy ? "" : f.dateTo,
    minimo: f.amountMin,
    maximo: f.amountMax,
    busqueda: f.customerSearch.trim(),
    deuda: f.hasDebt,
    notas: f.hasAdminNotes,
    hoy: esHoy,
    repartidor,
  };
}
/**
 * Cuándo dos vistas son la misma (la `firma` de `useVistasGuardadas`): se
 * ponen y se vuelven a leer con el día dado, así «Pedidos de hoy» guardada
 * ayer se reconoce hoy y el orden de los estados no cuenta. El menú dice
 * «Vista: Preparación» o, si se tocó algo, «Vista: a mano».
 */
export function firmaVistaPedidos(e: EstadoVistaPedidos, hoy: string): string {
  const { filters, repartidor } = aplicarVista(e.filtros, hoy);
  return JSON.stringify([capturarVista(filters, repartidor, hoy), e.orden.columna, e.orden.sentido]);
}

const COLUMNAS: readonly ColumnaOrden[] = ["cliente", "estado", "espera", "fecha", "total"];
const PAGOS: readonly string[] = ["", "yape", "efectivo"];
const ORIGENES: readonly string[] = ["", "direct", "marketplace"];
const TEXTOS = ["desde", "hasta", "minimo", "maximo", "busqueda", "repartidor"] as const;
const SI_NO = ["deuda", "notas", "hoy"] as const;

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * ¿Lo leído de localStorage es una vista de Pedidos? (el `valida` de
 * `useVistasGuardadas`). Lo que no tiene la forma (una versión vieja, una
 * edición a mano) se descarta en vez de romper la Lista.
 */
export function esEstadoVistaPedidos(x: unknown): x is EstadoVistaPedidos {
  if (!esObjeto(x) || !esObjeto(x.filtros) || !esObjeto(x.orden)) return false;
  const f = x.filtros;
  const o = x.orden;
  return (
    Array.isArray(f.estados) &&
    f.estados.every((s) => (ESTADOS_EN_MARCHA as readonly unknown[]).includes(s)) &&
    PAGOS.includes(f.pago as string) &&
    ORIGENES.includes(f.origen as string) &&
    TEXTOS.every((k) => typeof f[k] === "string") &&
    SI_NO.every((k) => typeof f[k] === "boolean") &&
    COLUMNAS.includes(o.columna as ColumnaOrden) &&
    (o.sentido === "asc" || o.sentido === "desc")
  );
}
