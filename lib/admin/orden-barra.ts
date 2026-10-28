/**
 * El orden de las categorías de la barra lateral del panel (Potenciar Buleje,
 * 28-10). Tres capas, de menor a mayor peso:
 *
 *  1. **Fábrica** (`TAB_CATEGORIES`): el orden de siempre.
 *  2. **Rubro**: si el negocio tiene prendida una especialización (forestal,
 *     agricultura) Y en 30 días sus pestañas se abren más que las de Ventas,
 *     su bloque sube justo debajo de Inicio. Medido en Blas (28-10): Forestal
 *     estaba en el puesto 19 de 24, debajo de Ventas, Pedidos y Marketplace,
 *     con 0 pedidos y 204 aperturas del Libro CTP. Tener la especialización
 *     prendida NO basta: `main` (la bodega) las tiene todas para QA y su barra
 *     ponía Forestal arriba de Ventas; y `Tenant.industry` no sirve (Blas dice
 *     «bodega»). Lo que manda es el uso.
 *     Dentro de la categoría del rubro, las pestañas van por uso real del
 *     negocio (aperturas de 30 días que guarda el servidor).
 *  3. **A mano**: el orden que la persona fijó (Configuración › Orden de la barra
 *     lateral, o el lápiz de la barra) MANDA sobre el rubro. Nada se borra ni se
 *     esconde: sólo cambia de lugar.
 *
 * Los favoritos no pasan por acá: son su propia sección arriba de todo.
 * Funciones puras; el estado vive en `app/admin/_hooks/useVisibleCategories.ts`.
 */

export interface CategoriaOrdenable {
  id: string;
  tabs: readonly string[];
}

/**
 * Qué sube con cada rubro. La primera es la del rubro (la que se ve como
 * encabezado de sección); las demás la acompañan. Cámaras va con Forestal: en
 * un aserradero mira el patio (395 aperturas en 30 días en Blas, la más usada).
 */
export const BLOQUE_DEL_RUBRO: Readonly<Record<string, readonly string[]>> = {
  forestal: ["forestal", "camaras"],
  agricultura: ["agricultura"],
};

/** La categoría que el rubro tiene que superar en aperturas para subir. */
const VENTAS = "ventas";

/** Debajo de esta: Inicio sigue siendo la puerta de entrada. */
const ANCLA = "inicio";
/** Con menos aperturas que esto en 30 días el uso no dice nada todavía: orden de fábrica. */
export const MINIMO_USO = 3;

export interface OpcionesOrden {
  /** El orden que la persona fijó a mano (ids de categoría). Vacío = ninguno. */
  ordenManual?: readonly string[];
  /** Rubros prendidos del negocio (`rubrosActivos`). */
  rubros?: readonly string[];
  /** Aperturas de 30 días por pestaña (`/api/admin/uso-panel?resumen=1`). */
  uso?: Readonly<Record<string, number>>;
}

/** Los rubros cuya categoría tiene al menos una pestaña prendida en el negocio. */
export function rubrosActivos(
  categorias: readonly CategoriaOrdenable[],
  prendidas: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const rubro of Object.keys(BLOQUE_DEL_RUBRO)) {
    const cat = categorias.find((c) => c.id === rubro);
    if (cat?.tabs.some((t) => prendidas.has(t))) out.push(rubro);
  }
  return out;
}

/**
 * ¿Este orden guardado es el de fábrica de antes? El lápiz de la barra
 * guardaba el orden entero aunque sólo se cambiara el color, y «Restablecer»
 * vuelve a escribirlo: eso no es un orden fijado a mano y no debe tapar el
 * rubro. Se mira el orden relativo de las categorías que conoce (hacen falta
 * dos para que haya orden).
 */
export function esOrdenDeFabrica(orden: readonly string[], fabrica: readonly string[]): boolean {
  const conocidas = orden.filter((id) => fabrica.includes(id));
  if (conocidas.length < 2) return false;
  const enFabrica = fabrica.filter((id) => conocidas.includes(id));
  return conocidas.every((id, i) => id === enFabrica[i]);
}

/** Hay un orden a mano que manda (no vacío y distinto del de fábrica). */
export function hayOrdenManual(orden: readonly string[] | undefined, fabrica: readonly string[]): boolean {
  return !!orden && orden.length > 0 && !esOrdenDeFabrica(orden, fabrica);
}

function aplicarManual<T extends CategoriaOrdenable>(fabrica: readonly T[], orden: readonly string[]): T[] {
  const porId = new Map(fabrica.map((c) => [c.id, c]));
  const out: T[] = [];
  for (const id of orden) {
    const c = porId.get(id);
    if (c && !out.includes(c)) out.push(c);
  }
  /* Las categorías nuevas (que no existían cuando se guardó) van al final, como siempre. */
  for (const c of fabrica) if (!out.includes(c)) out.push(c);
  return out;
}

/**
 * Los rubros que se ganan el lugar: con al menos `MINIMO_USO` aperturas en 30
 * días y más que las pestañas de Ventas. Sin uso todavía → ninguno (fábrica).
 */
export function rubrosQueSuben(
  categorias: readonly CategoriaOrdenable[],
  rubros: readonly string[],
  uso: Readonly<Record<string, number>>,
): string[] {
  const aperturas = (idsCat: readonly string[]) =>
    categorias.filter((c) => idsCat.includes(c.id)).flatMap((c) => c.tabs).reduce((s, t) => s + (uso[t] ?? 0), 0);
  const deVentas = aperturas([VENTAS]);
  return rubros.filter((r) => {
    const n = aperturas(BLOQUE_DEL_RUBRO[r] ?? [r]);
    return n >= MINIMO_USO && n > deVentas;
  });
}

function subirRubros<T extends CategoriaOrdenable>(fabrica: readonly T[], rubros: readonly string[]): T[] {
  const ids = rubros.flatMap((r) => BLOQUE_DEL_RUBRO[r] ?? [r]);
  const bloque = ids.map((id) => fabrica.find((c) => c.id === id)).filter((c): c is T => !!c);
  if (bloque.length === 0) return [...fabrica];
  const resto = fabrica.filter((c) => !bloque.includes(c));
  const ancla = resto.findIndex((c) => c.id === ANCLA);
  return [...resto.slice(0, ancla + 1), ...bloque, ...resto.slice(ancla + 1)];
}

/** Pestañas de una categoría por aperturas (desc). Empates y sin datos: el orden de fábrica. */
export function tabsPorUso(tabs: readonly string[], uso: Readonly<Record<string, number>>): string[] {
  const total = tabs.reduce((s, t) => s + (uso[t] ?? 0), 0);
  if (total < MINIMO_USO) return [...tabs];
  return tabs
    .map((t, i) => ({ t, i, n: uso[t] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.t);
}

/** El orden final de la barra. Devuelve los mismos objetos salvo la categoría del rubro, si se reordenó por dentro. */
export function ordenarBarra<T extends CategoriaOrdenable>(fabrica: readonly T[], opciones: OpcionesOrden = {}): T[] {
  const { ordenManual, rubros = [], uso = {} } = opciones;
  const idsFabrica = fabrica.map((c) => c.id);
  const base = hayOrdenManual(ordenManual, idsFabrica)
    ? aplicarManual(fabrica, ordenManual ?? [])
    : subirRubros(fabrica, rubrosQueSuben(fabrica, rubros, uso));
  /* Por dentro, por uso: sólo la categoría del rubro. Nadie fija a mano el orden de adentro, así que no pisa nada. */
  return base.map((c) => {
    if (!rubros.includes(c.id)) return c;
    const tabs = tabsPorUso(c.tabs, uso);
    return tabs.every((t, i) => t === c.tabs[i]) ? c : { ...c, tabs };
  });
}
