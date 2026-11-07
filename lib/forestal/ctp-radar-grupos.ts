/**
 * ctp-radar-grupos — que el radar aguante un libro real.
 *
 * `grafoTrazabilidad` trae hasta 300 líneas por columna. A 76 px por nodo eso
 * son ~23.000 px de alto: un dibujo que no se puede leer ni imprimir. La salida
 * no es achicar el nodo (ya no se leería) sino AGRUPAR: los ingresos por
 * especie, la producción por producto y los despachos por destino, con el
 * volumen sumado. 300 líneas se vuelven ~10 nodos, y el que quiere ver el
 * detalle expande el grupo que le interesa.
 *
 * La pieza delicada es la de las aristas: cuando un extremo está colapsado, la
 * línea tiene que ir al nodo-grupo y sumar los volúmenes de todas las líneas
 * que van ahí. Se resuelve con `resolver()` + agregación, así el resto del
 * radar (grosor, resaltado, conjunto conectado) sigue funcionando sin saber
 * que hay grupos.
 *
 * PURO y client-safe.
 */

/** A partir de acá una columna deja de leerse y conviene agrupar. */
export const UMBRAL_AGRUPAR = 12;

export const PREFIJO_GRUPO = "grp:";

export interface GrupoNodo<T> {
  /** Id sintético del grupo (`grp:<columna>:<clave>`). */
  id: string;
  clave: string;
  etiqueta: string;
  miembros: T[];
  /** Suma de la magnitud de sus miembros. */
  total: number;
}

export function idGrupo(columna: string, clave: string): string {
  return `${PREFIJO_GRUPO}${columna}:${clave}`;
}

export function esGrupo(id: string): boolean {
  return id.startsWith(PREFIJO_GRUPO);
}

/**
 * Agrupa una columna por una clave. Devuelve los grupos ordenados por total
 * descendente (lo más pesado arriba, que es lo que se mira primero).
 *
 * `forzar` permite agrupar aunque no se pase el umbral (el usuario lo pidió).
 */
export function agruparColumna<T>(
  nodos: T[],
  columna: string,
  claveDe: (n: T) => string,
  magnitudDe: (n: T) => number,
  opts: { umbral?: number; forzar?: boolean } = {},
): { agrupada: boolean; grupos: GrupoNodo<T>[] } {
  const umbral = opts.umbral ?? UMBRAL_AGRUPAR;
  const agrupada = opts.forzar === true || nodos.length > umbral;
  if (!agrupada) return { agrupada: false, grupos: [] };

  const mapa = new Map<string, GrupoNodo<T>>();
  for (const n of nodos) {
    const clave = (claveDe(n) || "—").trim() || "—";
    const g = mapa.get(clave) ?? { id: idGrupo(columna, clave), clave, etiqueta: clave, miembros: [], total: 0 };
    g.miembros.push(n);
    const m = magnitudDe(n);
    g.total = Number((g.total + (Number.isFinite(m) ? m : 0)).toFixed(4));
    mapa.set(clave, g);
  }
  return { agrupada: true, grupos: [...mapa.values()].sort((a, b) => b.total - a.total) };
}

/**
 * Mapa id-real → id-visible. Un nodo de un grupo expandido se mapea a sí mismo;
 * uno de un grupo colapsado, al id del grupo.
 */
export function construirResolver<T extends { id: string }>(
  grupos: GrupoNodo<T>[],
  expandidos: ReadonlySet<string>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of grupos) {
    const destino = expandidos.has(g.id) ? null : g.id;
    for (const n of g.miembros) m.set(n.id, destino ?? n.id);
  }
  return m;
}

/**
 * Reescribe las aristas al espacio visible y suma las que quedan paralelas.
 *
 * Sin esta suma, un grupo con 40 líneas dibujaría 40 aristas superpuestas hacia
 * el mismo punto — más pesado y menos legible que el grafo sin agrupar.
 */
export function agregarAristas<E extends { from: string; to: string }>(
  aristas: E[],
  valorDe: (e: E) => number,
  resolver: ReadonlyMap<string, string>,
): { from: string; to: string; valor: number; cuenta: number }[] {
  const mapa = new Map<string, { from: string; to: string; valor: number; cuenta: number }>();
  for (const e of aristas) {
    const from = resolver.get(e.from) ?? e.from;
    const to = resolver.get(e.to) ?? e.to;
    const k = `${from}->${to}`;
    const prev = mapa.get(k);
    const v = Number(valorDe(e)) || 0;
    if (prev) {
      prev.valor = Number((prev.valor + v).toFixed(4));
      prev.cuenta += 1;
    } else {
      mapa.set(k, { from, to, valor: Number(v.toFixed(4)), cuenta: 1 });
    }
  }
  return [...mapa.values()];
}

/**
 * Lista final de la columna: los grupos colapsados como un nodo, y los
 * expandidos reemplazados por sus miembros (con el grupo como encabezado).
 */
export function nodosVisibles<T extends { id: string }>(
  grupos: GrupoNodo<T>[],
  expandidos: ReadonlySet<string>,
): { grupo: GrupoNodo<T>; expandido: boolean; miembros: T[] }[] {
  return grupos.map((g) => ({ grupo: g, expandido: expandidos.has(g.id), miembros: expandidos.has(g.id) ? g.miembros : [] }));
}
