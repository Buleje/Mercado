/**
 * filtros-columna — el autofiltro de Excel, genérico para cualquier tabla del admin.
 *
 * Generaliza lo que ya vivía sólo en el Libro CTP (`lib/forestal/ctp-secciones-filtro.ts`,
 * Brandon 2026-09-03/10): la columna se filtra desde SU cabecera, con selección
 * múltiple (OR adentro de la columna, AND entre columnas) y rangos numéricos que
 * dejan afuera lo que no tiene dato. Acá no hay nada de forestal (ni especies, ni
 * m³): eso se queda en `lib/forestal/`, que sigue vivo y con sus tests.
 *
 * PURO: sin React. Lo que decide qué fila se ve se testea sin navegador.
 */

/** Un rango abierto por los dos lados: `null` = sin tope de ese lado. Sirve
 *  para números (m³, soles) y para fechas ISO `YYYY-MM-DD` (comparan igual de
 *  bien con `<`/`>` que un número). */
export interface Rango<V = number> {
  min: V | null;
  max: V | null;
}

/** Alias para el caso más común. */
export type RangoNumerico = Rango<number>;

/** Lo elegido en una columna de texto/multi/fecha, o el rango de una numérica. */
export type ValorFaceta = string[] | Rango<number> | Rango<string>;

/** Estado único de TODAS las columnas — la cabecera y el panel escriben acá,
 *  nunca cada uno el suyo (la regla de Brandon: dos controles del mismo estado
 *  enseñan a dudar de cuál manda). */
export type FacetasEstado = Partial<Record<string, ValorFaceta>>;

export type TipoColumnaFiltro = "texto" | "multi" | "rango" | "fecha";

export interface ColumnaFiltro<T> {
  id: string;
  label: string;
  tipo: TipoColumnaFiltro;
  /** texto/multi: uno o varios valores por fila (ej. un permiso puede traer dos). */
  valor?: (fila: T) => string | readonly string[] | null | undefined;
  /** rango: el número de la fila. fecha: la fecha ISO `YYYY-MM-DD` de la fila. */
  numero?: (fila: T) => number | string | null | undefined;
  /** Normaliza dos grafías del mismo valor a una sola clave (ADR-400: «Tornillo»
   *  y «TORNILLO» son la misma especie). Sin esto, cada grafía es una opción
   *  aparte con la mitad del peso. */
  clave?: (v: string) => string;
  /** Peso opcional de la fila (m³, soles…) para ordenar/mostrar la opción por
   *  peso y no sólo por cuántas líneas tiene — se elige por peso, no por nombre. */
  peso?: (fila: T) => number | null | undefined;
  unidad?: string;
  unidadPeso?: string;
  paso?: number;
  /** La columna está oculta (el menú «Columnas» la apagó). Default `true`: su
   *  filtro emigra al panel para no quedar sin ningún control que lo saque —
   *  el «filtro huérfano» que Brandon pidió evitar. */
  visible?: boolean;
  /** El autofiltro sólo aparece si hay ≥2 valores distintos (listas chicas y
   *  fijas, ej. las trozas de un lote). Default `false` = siempre, como el
   *  embudo de Excel en un libro paginado. */
  soloConVarios?: boolean;
  /** Cómo se lee un límite del rango en el resumen y en los chips («10/09»
   *  en vez de «2026-09-10»). Default: el valor tal cual. */
  formatearValor?: (v: number | string) => string;
}

export interface FacetaOpcion {
  value: string;
  count: number;
  peso?: number;
}

// ── Lo elegido, siempre como lista ──────────────────────────────────────────

/** `true` si ese filtro está puesto (una lista vacía o un rango sin topes NO filtra). */
export function filtroActivo(v: ValorFaceta | undefined): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return rangoActivo(v);
}

/** Lo elegido en texto/multi, siempre como lista. */
export function valoresDe(v: ValorFaceta | undefined): string[] {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

/** El valor crudo de la fila, siempre como lista (un string suelto = lista de uno). */
function valoresDeFila(crudo: string | readonly string[] | null | undefined): string[] {
  if (crudo == null) return [];
  return Array.isArray(crudo) ? crudo.filter(Boolean) : crudo ? [crudo as string] : [];
}

/**
 * ¿El valor de la fila entra en lo elegido? Sin filtro puesto entra todo; con
 * filtro basta que coincida con UNO de los elegidos (OR dentro de la columna).
 */
export function coincideFiltro(
  elegidos: readonly string[],
  valorFila: string,
  clave: (x: string) => string = (x) => x,
): boolean {
  if (elegidos.length === 0) return true;
  const k = clave(valorFila);
  return elegidos.some((x) => clave(x) === k);
}

// ── Rangos ───────────────────────────────────────────────────────────────────

/** ¿Hay algo puesto en este rango? `{min:null,max:null}` no filtra nada.
 *  Sin genérico a propósito: se llama tanto con `Rango<number>` como con
 *  `Rango<string>` (fechas) y, en el estado único, a veces con la unión de
 *  las dos — sólo mira si `min`/`max` están puestos, nunca su tipo. */
export function rangoActivo(r: { min: unknown; max: unknown } | undefined): boolean {
  return Boolean(r && (r.min != null || r.max != null));
}

/**
 * ¿El valor cae en el rango? Sin rango, todo entra.
 *
 * Un valor AUSENTE no entra en un rango pedido: una fila sin ese dato no puede
 * afirmar que cumple «≥ 50» — es lo mismo que hace Excel con una celda vacía
 * (memoria `filtros-en-la-cabecera-tipo-excel`).
 */
export function enRango<V extends number | string>(
  v: V | null | undefined,
  r: Rango<V> | undefined,
): boolean {
  if (!rangoActivo(r)) return true;
  if (v == null) return false;
  if (typeof v === "number" && !Number.isFinite(v)) return false;
  if (r!.min != null && v < r!.min) return false;
  if (r!.max != null && v > r!.max) return false;
  return true;
}

/** Cómo se lee un rango puesto: «≥ 0.5 m³», «≤ 10/09», «0.5 – 2 m³». */
export function textoDeRango<V extends number | string>(
  label: string,
  r: Rango<V>,
  opts: { unidad?: string; formatear?: (v: V) => string } = {},
): string {
  const { unidad = "", formatear = (v: V) => String(v) } = opts;
  const { min, max } = r;
  const cuerpo =
    min != null && max != null
      ? `${formatear(min)} – ${formatear(max)}`
      : min != null
        ? `≥ ${formatear(min)}`
        : `≤ ${formatear(max as V)}`;
  return `${label} ${cuerpo}${unidad ? ` ${unidad}` : ""}`.trim();
}

// ── Facetas (las opciones del autofiltro, con su peso) ──────────────────────

/**
 * Las opciones de una columna texto/multi, agrupadas por `clave` y ordenadas
 * por peso (si lo hay) y si no por cantidad de líneas — se elige por peso, no
 * por nombre, y una opción que devuelve cero es una trampa.
 *
 * Rango/fecha no tienen opciones discretas: devuelve `[]`.
 */
export function opcionesDeColumna<T>(filas: readonly T[], columna: ColumnaFiltro<T>): FacetaOpcion[] {
  if (columna.tipo !== "texto" && columna.tipo !== "multi") return [];
  const clave = columna.clave ?? ((v: string) => v);
  const map = new Map<string, { value: string; count: number; peso: number }>();
  for (const fila of filas) {
    const valores = valoresDeFila(columna.valor?.(fila));
    for (const v0 of valores) {
      const v = v0.trim();
      if (!v) continue;
      const k = clave(v);
      if (!k) continue;
      // Se muestra el nombre TAL COMO está escrito en la primera línea del
      // grupo: inventar una forma canónica pondría en pantalla un texto que no
      // está en ningún asiento real.
      const prev = map.get(k) ?? { value: v, count: 0, peso: 0 };
      const peso = columna.peso?.(fila) ?? 0;
      map.set(k, { value: prev.value, count: prev.count + 1, peso: prev.peso + (peso ?? 0) });
    }
  }
  return [...map.values()]
    .map(({ value, count, peso }) => ({ value, count, peso: columna.peso ? Math.round(peso * 100) / 100 : undefined }))
    .sort((a, b) => (b.peso ?? b.count) - (a.peso ?? a.count) || a.value.localeCompare(b.value));
}

/** `true` si esta columna debe mostrar el autofiltro (regla de `soloConVarios`). */
export function columnaTieneAutofiltro<T>(filas: readonly T[], columna: ColumnaFiltro<T>): boolean {
  if (columna.tipo === "rango" || columna.tipo === "fecha") return true;
  if (!columna.soloConVarios) return true;
  return opcionesDeColumna(filas, columna).length >= 2;
}

// ── Aplicar las facetas ──────────────────────────────────────────────────────

/** Aplica TODAS las facetas activas. AND entre columnas, OR adentro de cada una. */
export function aplicarFacetas<T>(
  filas: readonly T[],
  columnas: readonly ColumnaFiltro<T>[],
  facetas: FacetasEstado,
): T[] {
  return filas.filter((fila) =>
    columnas.every((columna) => {
      const v = facetas[columna.id];
      if (!v || !filtroActivo(v)) return true;
      if (columna.tipo === "rango" || columna.tipo === "fecha") {
        const numero = columna.numero?.(fila) ?? null;
        return enRango(numero as never, v as Rango<never>);
      }
      const clave = columna.clave ?? ((x: string) => x);
      const valoresFila = valoresDeFila(columna.valor?.(fila));
      // Sin dato no entra en un filtro puesto — misma regla que el rango.
      if (valoresFila.length === 0) return false;
      return valoresFila.some((vf) => coincideFiltro(valoresDe(v), vf, clave));
    }),
  );
}

/** Cuántas COLUMNAS están acotando (el badge del botón «Filtros»): una columna
 *  con tres valores tildados cuenta 1, no 3. */
export function contarFacetas(facetas: FacetasEstado): number {
  return Object.values(facetas).filter((v) => v !== undefined && filtroActivo(v)).length;
}

export interface ChipFiltro {
  id: string;
  label: string;
  texto: string;
}

/** Los filtros puestos, para dibujarlos como chips con su cruz arriba de la
 *  tabla — el control que evita el filtro huérfano cuando se apaga una columna. */
export function facetasPuestas<T>(
  columnas: readonly ColumnaFiltro<T>[],
  facetas: FacetasEstado,
): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  for (const columna of columnas) {
    const v = facetas[columna.id];
    if (!v || !filtroActivo(v)) continue;
    if (columna.tipo === "rango" || columna.tipo === "fecha") {
      chips.push({
        id: columna.id,
        label: columna.label,
        texto: textoDeRango(columna.label, v as Rango<never>, {
          unidad: columna.unidad,
          formatear: columna.formatearValor as ((v: never) => string) | undefined,
        }),
      });
      continue;
    }
    const lista = valoresDe(v);
    const texto =
      lista.length === 1
        ? lista[0]
        : `${columna.label}: ${lista.length} elegidos`;
    chips.push({ id: columna.id, label: columna.label, texto });
  }
  return chips;
}

/** Las columnas OCULTAS que igual tienen un filtro puesto: sin esto, apagar una
 *  columna desde «Columnas» dejaría la tabla acotada sin ningún control visible
 *  para desacotarla (el «filtro huérfano»). El panel debe seguir dibujándolas. */
export function columnasOcultasConFiltro<T>(
  columnas: readonly ColumnaFiltro<T>[],
  facetas: FacetasEstado,
): ColumnaFiltro<T>[] {
  return columnas.filter((c) => c.visible === false && filtroActivo(facetas[c.id]));
}
