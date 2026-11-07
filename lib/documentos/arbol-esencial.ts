/**
 * El árbol de una carpeta esencial (Brandon 23-10): toda la carpeta desplegable
 * con la cuenta de papeles de cada rama, para llegar al 4.º nivel sin entrar
 * de a una (en Blas el 98 % de los papeles vive a 3 niveles o más) y arrastrar
 * papeles de una subcarpeta a otra.
 *
 * Puro: lo usan `ArbolEsencial`, `CarpetaAmplia` y los tests. Una carpeta que
 * apunta a sí misma o un ciclo entre carpetas (dato roto) no cuelga: cada
 * carpeta entra al árbol una sola vez.
 */

import type { CarpetaMin, DocMin } from "./terceros-vinculo";

export interface NodoArbol<C extends CarpetaMin = CarpetaMin> {
  carpeta: C;
  /** Subcarpetas, por nombre (orden natural: «Lote 2» antes que «Lote 10»). */
  hijos: NodoArbol<C>[];
  /** Papeles sueltos en esta carpeta. */
  docsDirectos: number;
  /** Papeles en esta carpeta y en todas sus subcarpetas. */
  docsTotales: number;
  bytesTotales: number;
  /** 0 = la carpeta esencial. */
  nivel: number;
}

type DocConPeso = DocMin & { size?: number };

const porNombre = (a: CarpetaMin, b: CarpetaMin) => a.name.localeCompare(b.name, "es", { numeric: true });

/** El árbol desde `raiz` con lo que el rol ve (`carpetas`) y los papeles vivos (`docs`). */
export function armarArbol<C extends CarpetaMin>(raiz: C, carpetas: readonly C[], docs: readonly DocConPeso[]): NodoArbol<C> {
  const hijosDe = new Map<string, C[]>();
  for (const c of carpetas) {
    if (!c.parentId || c.id === raiz.id || c.id === c.parentId) continue;
    const lista = hijosDe.get(c.parentId) ?? [];
    lista.push(c);
    hijosDe.set(c.parentId, lista);
  }
  for (const lista of hijosDe.values()) lista.sort(porNombre);

  const directos = new Map<string, { n: number; bytes: number }>();
  for (const d of docs) {
    if (!d.folderId) continue;
    const a = directos.get(d.folderId) ?? { n: 0, bytes: 0 };
    a.n++;
    a.bytes += d.size ?? 0;
    directos.set(d.folderId, a);
  }

  const visto = new Set<string>();
  const armar = (carpeta: C, nivel: number): NodoArbol<C> => {
    visto.add(carpeta.id);
    const hijos: NodoArbol<C>[] = [];
    for (const h of hijosDe.get(carpeta.id) ?? []) {
      if (visto.has(h.id)) continue;
      hijos.push(armar(h, nivel + 1));
    }
    const propio = directos.get(carpeta.id) ?? { n: 0, bytes: 0 };
    return {
      carpeta,
      hijos,
      docsDirectos: propio.n,
      docsTotales: propio.n + hijos.reduce((s, h) => s + h.docsTotales, 0),
      bytesTotales: propio.bytes + hijos.reduce((s, h) => s + h.bytesTotales, 0),
      nivel,
    };
  };
  return armar(raiz, 0);
}

/** Todos los nodos en el orden en que se leen (la madre antes que sus hijas). */
export function aplanar<C extends CarpetaMin>(arbol: NodoArbol<C>): NodoArbol<C>[] {
  const salida: NodoArbol<C>[] = [];
  const pila: NodoArbol<C>[] = [arbol];
  while (pila.length > 0) {
    const n = pila.pop() as NodoArbol<C>;
    salida.push(n);
    for (let i = n.hijos.length - 1; i >= 0; i--) pila.push(n.hijos[i]);
  }
  return salida;
}

/** Los nodos que se ven con `abiertos` desplegados, en orden, con su madre (para ← del teclado). */
export function visiblesEnOrden<C extends CarpetaMin>(
  arbol: NodoArbol<C>,
  abiertos: ReadonlySet<string>,
): { nodo: NodoArbol<C>; padreId: string | null }[] {
  const salida: { nodo: NodoArbol<C>; padreId: string | null }[] = [];
  const pila: { nodo: NodoArbol<C>; padreId: string | null }[] = [{ nodo: arbol, padreId: null }];
  while (pila.length > 0) {
    const x = pila.pop() as { nodo: NodoArbol<C>; padreId: string | null };
    salida.push(x);
    if (!abiertos.has(x.nodo.carpeta.id)) continue;
    for (let i = x.nodo.hijos.length - 1; i >= 0; i--) pila.push({ nodo: x.nodo.hijos[i], padreId: x.nodo.carpeta.id });
  }
  return salida;
}

/** De la carpeta esencial a `id`, ambas incluidas. Vacío si `id` no está en el árbol. */
export function caminoHasta<C extends CarpetaMin>(arbol: NodoArbol<C>, id: string): NodoArbol<C>[] {
  const camino: NodoArbol<C>[] = [];
  const buscar = (n: NodoArbol<C>): boolean => {
    camino.push(n);
    if (n.carpeta.id === id) return true;
    for (const h of n.hijos) if (buscar(h)) return true;
    camino.pop();
    return false;
  };
  return buscar(arbol) ? camino : [];
}

/** Las carpetas que hay que desplegar para que `id` se vea (sus antecesoras dentro del árbol). */
export function ancestrosDe(arbol: NodoArbol, id: string): string[] {
  return caminoHasta(arbol, id).slice(0, -1).map((n) => n.carpeta.id);
}

/** El nodo de `id`, si está en el árbol. */
export function nodoDe<C extends CarpetaMin>(arbol: NodoArbol<C>, id: string): NodoArbol<C> | null {
  return caminoHasta(arbol, id).at(-1) ?? null;
}

/** La carpeta del nodo y todas las de debajo. */
export function idsDeLaRama(nodo: NodoArbol): Set<string> {
  return new Set(aplanar(nodo).map((n) => n.carpeta.id));
}

/** Dónde está una carpeta mirando desde `desdeId`: «2026 › Enero». Vacío si es la misma. */
export function rutaRelativa(arbol: NodoArbol, folderId: string, desdeId: string): string {
  const camino = caminoHasta(arbol, folderId);
  const i = camino.findIndex((n) => n.carpeta.id === desdeId);
  return camino.slice(i < 0 ? 1 : i + 1).map((n) => n.carpeta.name).join(" › ");
}

/** Lo que trae el arrastre de papeles (JSON de ids). Cualquier otra cosa, nada. */
export function leerIdsArrastrados(crudo: string | null | undefined): string[] {
  if (!crudo) return [];
  try {
    const v: unknown = JSON.parse(crudo);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))];
  } catch {
    return [];
  }
}

/** Los papeles que de verdad cambian de carpeta: existen y no están ya en `destino`. */
export function idsAMover(ids: readonly string[], docs: readonly DocMin[], destino: string): string[] {
  const porId = new Map(docs.map((d) => [d.id, d]));
  return ids.filter((id) => {
    const d = porId.get(id);
    return !!d && d.folderId !== destino;
  });
}

/** «3 papeles movidos a «GTF 2026»». */
export function textoMovidos(n: number, carpeta: string): string {
  return n === 1 ? `1 papel movido a «${carpeta}»` : `${n} papeles movidos a «${carpeta}»`;
}

type DocBuscable = DocMin & {
  originalName?: string | null;
  tags?: readonly string[] | null;
  aiTags?: readonly string[] | null;
  ocrText?: string | null;
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Nombre, nombre original, etiquetas y texto leído (OCR), sin tildes, como en Terceros. */
export function coincideBusqueda(doc: DocBuscable, q: string): boolean {
  const aguja = sinTildes(q.trim());
  if (!aguja) return true;
  return sinTildes([doc.name, doc.originalName, (doc.tags ?? []).join(" "), (doc.aiTags ?? []).join(" "), doc.ocrText].filter(Boolean).join(" ")).includes(aguja);
}

/**
 * Los papeles que se ven en el centro: los de la carpeta mirada (y sus subcarpetas
 * si `incluirSubcarpetas`). Con búsqueda, en TODA la carpeta esencial, no sólo en
 * la mirada. Una carpeta mirada que no está en el árbol cae a la esencial.
 */
export function papelesDeLaVista<D extends DocBuscable>(args: {
  arbol: NodoArbol;
  docs: readonly D[];
  dentroDe: string;
  incluirSubcarpetas: boolean;
  q?: string;
}): D[] {
  const { arbol, docs, dentroDe, incluirSubcarpetas, q = "" } = args;
  if (q.trim()) {
    const ids = idsDeLaRama(arbol);
    return docs.filter((d) => !!d.folderId && ids.has(d.folderId) && coincideBusqueda(d, q));
  }
  const nodo = nodoDe(arbol, dentroDe) ?? arbol;
  if (!incluirSubcarpetas) return docs.filter((d) => d.folderId === nodo.carpeta.id);
  const ids = idsDeLaRama(nodo);
  return docs.filter((d) => !!d.folderId && ids.has(d.folderId));
}
