/**
 * ctp-secciones-filtro — facetas, filtrado y totales de Producción/Despacho.
 *
 * A diferencia de Ingresos (paginado: las facetas las calcula la DB), estas dos
 * vistas traen TODO el período en una carga, así que lo correcto es derivar las
 * opciones de lo que ya está en memoria — sin una request más y sin poder
 * mentir: la opción existe porque hay una línea que la tiene.
 *
 * PURO: sin React ni fetch. Lo que decide qué se ve en un libro fiscalizable se
 * testea sin navegador.
 */

export interface LineaCtp {
  id: string;
  entryDate: string;
  speciesCommon: string | null;
  productType: string | null;
  destino: string | null;
  cites: boolean;
  quantity: string | null;
  volumeInputM3: string | null;
  pieces: number | null;
  rendimientoPct: string | null;
  status: "registrado" | "anulado";
  /** Sólo Producción: N° de Permiso heredado de los ingresos consumidos. */
  permisoOrigen?: string[];
  /** Qué sección es la línea: `claveSalida` sólo opina de Producción. */
  section?: string | null;
  /** Lo que ya salió de este paquete (despachado y reprocesado). */
  despachadoQty?: string | number | null;
  reprocesadoQty?: string | number | null;
}

export interface FacetaSeccion {
  value: string;
  count: number;
  volumeM3?: number;
}

export interface FiltrosSeccion {
  species?: string;
  product?: string;
  destino?: string;
  cites?: boolean;
  /** Sólo Producción. */
  permiso?: string;
  /** Sólo Producción: en qué anda el paquete (patio / parcial / despachado). */
  salida?: ClaveSalida;
}

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** En qué anda el paquete producido. */
export type ClaveSalida = "stock" | "parcial" | "salido";

/** Cómo se llama cada estado en pantalla (el filtro de la columna «Salida»). */
export const SALIDA_LABEL: Record<ClaveSalida, string> = {
  stock: "En patio",
  parcial: "Parcial",
  salido: "Despachado",
};

/**
 * ¿El paquete sigue en el patio, salió a medias o ya se fue?
 *
 * Vive acá —en el módulo puro— y no en el componente que lo pinta porque ahora
 * la responden DOS cosas: el badge de la fila (`estadoSalida`) y el filtro de la
 * columna. Calculada dos veces, una tabla podría mostrar «En patio» en la fila y
 * esconderla al filtrar por «En patio», que es la clase de contradicción que un
 * libro fiscalizable no puede permitirse.
 *
 * La tolerancia de 0.0001 es la de siempre: no se toca acá, sólo se muda.
 */
export function claveSalida(l: {
  section?: string | null;
  quantity: string | null;
  despachadoQty?: string | number | null;
  reprocesadoQty?: string | number | null;
}): ClaveSalida | null {
  if (l.section !== "produccion") return null;
  const producido = num(l.quantity);
  if (!(producido > 0)) return null;
  const fuera = num(l.despachadoQty) + num(l.reprocesadoQty);
  if (fuera <= 0.0001) return "stock";
  if (producido - fuera > 0.0001) return "parcial";
  return "salido";
}

/**
 * Agrupa por un campo y suma su peso. El peso de una línea de producción es lo
 * que produjo (`quantity`); el volumen consumido va aparte porque no es lo
 * mismo lo que entró que lo que salió — confundirlos infla el libro.
 */
function agrupar(
  lineas: LineaCtp[],
  campo: (l: LineaCtp) => string | null,
  peso: (l: LineaCtp) => number,
): FacetaSeccion[] {
  const map = new Map<string, { count: number; peso: number }>();
  for (const l of lineas) {
    const v = (campo(l) ?? "").trim();
    if (!v) continue;
    const prev = map.get(v) ?? { count: 0, peso: 0 };
    map.set(v, { count: prev.count + 1, peso: prev.peso + peso(l) });
  }
  return [...map.entries()]
    .map(([value, { count, peso }]) => ({ value, count, volumeM3: r2(peso) }))
    .sort((a, b) => (b.volumeM3 ?? 0) - (a.volumeM3 ?? 0) || b.count - a.count)
    .slice(0, 30);
}

/**
 * Igual que `agrupar`, pero para un campo de VARIOS valores por línea (una
 * corrida puede tener más de un permiso: dos guías de dos concesiones
 * aserradas juntas). El peso de la línea se cuenta una vez por cada permiso
 * que declara — no se reparte — porque lo que importa acá es "¿qué corridas
 * tocó este permiso?", no partir el volumen entre ellos.
 */
function agruparMultiple(
  lineas: LineaCtp[],
  campo: (l: LineaCtp) => string[] | undefined,
  peso: (l: LineaCtp) => number,
): FacetaSeccion[] {
  const map = new Map<string, { count: number; peso: number }>();
  for (const l of lineas) {
    for (const v of new Set((campo(l) ?? []).map((x) => x.trim()).filter(Boolean))) {
      const prev = map.get(v) ?? { count: 0, peso: 0 };
      map.set(v, { count: prev.count + 1, peso: prev.peso + peso(l) });
    }
  }
  return [...map.entries()]
    .map(([value, { count, peso }]) => ({ value, count, volumeM3: r2(peso) }))
    .sort((a, b) => (b.volumeM3 ?? 0) - (a.volumeM3 ?? 0) || b.count - a.count)
    .slice(0, 30);
}

/**
 * Las facetas de la vista. `destino` sólo tiene sentido en Despacho; `permisos` y
 * `salidas`, en Producción.
 *
 * `salidas` NO va por `agrupar`: sus tres valores tienen un orden natural —lo
 * que está en el patio, lo que salió a medias, lo que ya se fue— y ordenarlos
 * por volumen los barajaría distinto en cada período.
 */
export function facetasDeSeccion(lineas: LineaCtp[]): {
  species: FacetaSeccion[];
  products: FacetaSeccion[];
  destinos: FacetaSeccion[];
  permisos: FacetaSeccion[];
  salidas: FacetaSeccion[];
} {
  // Sólo líneas VIVAS: una anulada no describe el período (y elegir una faceta
  // que sólo tienen las anuladas devolvería una lista vacía).
  const vivas = lineas.filter((l) => l.status === "registrado");
  const porSalida = new Map<ClaveSalida, { count: number; peso: number }>();
  for (const l of vivas) {
    const k = claveSalida(l);
    if (!k) continue;
    const prev = porSalida.get(k) ?? { count: 0, peso: 0 };
    porSalida.set(k, { count: prev.count + 1, peso: prev.peso + num(l.quantity) });
  }
  return {
    species: agrupar(vivas, (l) => l.speciesCommon, (l) => num(l.quantity)),
    products: agrupar(vivas, (l) => l.productType, (l) => num(l.quantity)),
    destinos: agrupar(vivas, (l) => l.destino, (l) => num(l.quantity)),
    permisos: agruparMultiple(vivas, (l) => l.permisoOrigen, (l) => num(l.quantity)),
    salidas: (["stock", "parcial", "salido"] as const).flatMap((k) => {
      const v = porSalida.get(k);
      return v ? [{ value: k, count: v.count, volumeM3: r2(v.peso) }] : [];
    }),
  };
}

/** Aplica las facetas activas. Sin filtros devuelve la lista tal cual. */
export function filtrarSeccion<T extends LineaCtp>(lineas: T[], f: FiltrosSeccion): T[] {
  return lineas.filter((l) => {
    if (f.species && (l.speciesCommon ?? "") !== f.species) return false;
    if (f.product && (l.productType ?? "") !== f.product) return false;
    if (f.destino && (l.destino ?? "") !== f.destino) return false;
    if (f.cites !== undefined && l.cites !== f.cites) return false;
    if (f.permiso && !(l.permisoOrigen ?? []).includes(f.permiso)) return false;
    if (f.salida && claveSalida(l) !== f.salida) return false;
    return true;
  });
}

/** Cuántos filtros están puestos (el badge del botón). */
export function contarFiltros(f: FiltrosSeccion): number {
  return (
    (f.species ? 1 : 0) +
    (f.product ? 1 : 0) +
    (f.destino ? 1 : 0) +
    (f.cites !== undefined ? 1 : 0) +
    (f.permiso ? 1 : 0) +
    (f.salida ? 1 : 0)
  );
}

export interface TotalesSeccion {
  lineas: number;
  cantidad: number;
  consumido: number;
  piezas: number;
}

/**
 * Totales de lo que se está viendo. Cuenta SOLO líneas vivas: sumar una anulada
 * en el pie de la tabla diría que se produjo madera que se dio de baja.
 */
export function totalesDeSeccion(lineas: LineaCtp[]): TotalesSeccion {
  const vivas = lineas.filter((l) => l.status === "registrado");
  return {
    lineas: vivas.length,
    cantidad: r2(vivas.reduce((a, l) => a + num(l.quantity), 0)),
    consumido: r2(vivas.reduce((a, l) => a + num(l.volumeInputM3), 0)),
    piezas: vivas.reduce((a, l) => a + (l.pieces ?? 0), 0),
  };
}
