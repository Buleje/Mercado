/**
 * ¿Hay algo que mostrar? — la regla ÚNICA de los tableros de Inicio
 * (`?tab=vendor-dashboard`, pestañas Resumen → Marketplace).
 *
 * Pedido de Brandon (2026-10-09): «ocultar gráficos que no tienen ninguna
 * información hasta que se muestre algún dato» y, si la pestaña entera no
 * tiene datos, sólo el estado vacío del paiche (`EmptyDateRangeState`).
 *
 * Qué cuenta como «sin información» (lo deciden estas funciones, no cada
 * pestaña a su manera):
 *  - una serie cuyos valores son todos 0, null, NaN o vacíos;
 *  - una tendencia (línea/área en el tiempo) con menos de 2 puntos con valor:
 *    un punto solo no es una tendencia;
 *  - un ranking sin filas. Con 1-2 filas no es un gráfico de barras: es una
 *    lista corta (`modoRanking`).
 *
 * Sólo presentación: nada de esto recalcula cifras; mira lo que ya llegó.
 */

/** Lo mínimo para hablar de tendencia: con un punto solo no hay línea. */
export const MIN_PUNTOS_TENDENCIA = 2;

/** Desde cuántas filas un ranking se dibuja como barras (antes, lista corta). */
export const MIN_FILAS_GRAFICO_RANKING = 3;

/**
 * El número que trae un valor, si trae alguno: number finito o string
 * numérico (los Decimal de Prisma llegan como «"12.50"»). Lo demás → null.
 */
export function numeroDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** true si el valor es un número distinto de 0 (0, null, NaN y "" no son dato). */
export function valorConDato(v: unknown): boolean {
  const n = numeroDe(v);
  return n !== null && n !== 0;
}

/**
 * ¿La serie tiene algo que dibujar? true si ALGUNA de las `claves` tiene al
 * menos `minPuntos` filas con valor distinto de 0/null.
 *
 * @example
 * // Ventas por día: un día con S/ 40 y el resto en 0 → para barras sí hay dato…
 * hayDatosEnSerie(dias, ["ventas"]); // true
 * // …pero como tendencia (línea) un punto no alcanza:
 * hayDatosEnSerie(dias, ["ventas"], { minPuntos: 2 }); // false
 *
 * @example
 * // Caja con ingresos en 0 todos los días pero egresos en 3 días:
 * hayDatosEnSerie(caja, ["ingresos", "egresos"]); // true (egresos tiene dato)
 */
export function hayDatosEnSerie<T extends object>(
  filas: readonly T[] | null | undefined,
  claves: readonly (keyof T & string)[],
  opts: { minPuntos?: number } = {},
): boolean {
  if (!filas || filas.length === 0 || claves.length === 0) return false;
  const minPuntos = Math.max(1, opts.minPuntos ?? 1);
  return claves.some((clave) => {
    let puntos = 0;
    for (const fila of filas) {
      if (valorConDato((fila as Record<string, unknown>)[clave])) {
        puntos += 1;
        if (puntos >= minPuntos) return true;
      }
    }
    return false;
  });
}

/**
 * Atajo de `hayDatosEnSerie` con `minPuntos: 2`: para líneas y áreas en el tiempo.
 *
 * @example
 * hayTendencia([{ d: "01 oct", v: 0 }, { d: "02 oct", v: 50 }], ["v"]); // false (1 punto)
 * hayTendencia([{ d: "01 oct", v: 20 }, { d: "02 oct", v: 50 }], ["v"]); // true
 */
export function hayTendencia<T extends object>(
  filas: readonly T[] | null | undefined,
  claves: readonly (keyof T & string)[],
): boolean {
  return hayDatosEnSerie(filas, claves, { minPuntos: MIN_PUNTOS_TENDENCIA });
}

/**
 * ¿La lista tiene al menos `min` filas? Para rankings, tablas y listas.
 *
 * @example
 * hayFilas(topProductos);     // true con 1 fila o más
 * hayFilas(topProductos, 3);  // true sólo con 3 o más
 */
export function hayFilas(lista: readonly unknown[] | null | undefined, min = 1): boolean {
  return Array.isArray(lista) && lista.length >= Math.max(1, min);
}

export type ModoRanking = "oculto" | "lista" | "grafico";

/**
 * Cómo se muestra un ranking según cuántas filas CON VALOR trae.
 * 0 → «oculto» · 1-2 → «lista» corta · 3+ → «grafico» de barras.
 * Si se pasa `clave`, las filas con ese valor en 0/null no cuentan.
 *
 * @example
 * modoRanking([{ nombre: "Arroz", total: 120 }], "total");          // "lista"
 * modoRanking([{ n: "A", t: 9 }, { n: "B", t: 0 }, { n: "C", t: 0 }], "t"); // "lista"
 */
export function modoRanking<T extends object>(
  lista: readonly T[] | null | undefined,
  clave?: keyof T & string,
  minGrafico = MIN_FILAS_GRAFICO_RANKING,
): ModoRanking {
  if (!lista || lista.length === 0) return "oculto";
  const conValor = clave
    ? lista.filter((f) => valorConDato((f as Record<string, unknown>)[clave])).length
    : lista.length;
  if (conValor === 0) return "oculto";
  return conValor >= Math.max(1, minGrafico) ? "grafico" : "lista";
}

/**
 * ¿El KPI se muestra como «—» atenuado? null/undefined/NaN siempre; el 0 también,
 * salvo que el cero SEA la noticia (`{ ceroEsDato: true }`: «0 productos sin
 * stock», «0 pedidos atrasados»).
 *
 * @example
 * kpiSinDato(0);                         // true  → «—» con ⓘ «todavía no hay ventas»
 * kpiSinDato(0, { ceroEsDato: true });   // false → «0» es buena noticia
 */
export function kpiSinDato(valor: unknown, opts: { ceroEsDato?: boolean } = {}): boolean {
  const n = numeroDe(valor);
  if (n === null) return true;
  return n === 0 && !opts.ceroEsDato;
}

/**
 * ¿Hay ALGÚN dato en la pestaña? Recibe números (KPIs) o booleanos ya
 * calculados (p. ej. `hayDatosEnSerie(...)`). false → la pestaña muestra sólo
 * `EmptyDateRangeState` (regla R1), sin muro de KPIs en cero.
 *
 * @example
 * algunDato([ventasTotal, pedidos, hayDatosEnSerie(dias, ["ventas"])]); // false si todo es 0
 * algunDato([0, null, true]); // true
 */
export function algunDato(valores: readonly unknown[]): boolean {
  return valores.some((v) => (typeof v === "boolean" ? v : valorConDato(v)));
}
