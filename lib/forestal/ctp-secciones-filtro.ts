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
}

const num = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

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

/** Las tres facetas de la vista. `destino` sólo tiene sentido en Despacho. */
export function facetasDeSeccion(lineas: LineaCtp[]): {
  species: FacetaSeccion[];
  products: FacetaSeccion[];
  destinos: FacetaSeccion[];
} {
  // Sólo líneas VIVAS: una anulada no describe el período (y elegir una faceta
  // que sólo tienen las anuladas devolvería una lista vacía).
  const vivas = lineas.filter((l) => l.status === "registrado");
  return {
    species: agrupar(vivas, (l) => l.speciesCommon, (l) => num(l.quantity)),
    products: agrupar(vivas, (l) => l.productType, (l) => num(l.quantity)),
    destinos: agrupar(vivas, (l) => l.destino, (l) => num(l.quantity)),
  };
}

/** Aplica las facetas activas. Sin filtros devuelve la lista tal cual. */
export function filtrarSeccion<T extends LineaCtp>(lineas: T[], f: FiltrosSeccion): T[] {
  return lineas.filter((l) => {
    if (f.species && (l.speciesCommon ?? "") !== f.species) return false;
    if (f.product && (l.productType ?? "") !== f.product) return false;
    if (f.destino && (l.destino ?? "") !== f.destino) return false;
    if (f.cites !== undefined && l.cites !== f.cites) return false;
    return true;
  });
}

/** Cuántos filtros están puestos (el badge del botón). */
export function contarFiltros(f: FiltrosSeccion): number {
  return (
    (f.species ? 1 : 0) + (f.product ? 1 : 0) + (f.destino ? 1 : 0) + (f.cites !== undefined ? 1 : 0)
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
