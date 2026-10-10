/**
 * cubicacion-formato — cómo se ESCRIBEN los números del lote cubicado.
 *
 * Single source de las siete vistas de Resúmenes. Dos decisiones que salen del
 * patio, no del punto flotante:
 *
 *   · **Pie tablar entero.** La madera se compra, se vende y se factura por pie
 *     tablar; el centésimo de pie no se mide con cinta ni se cobra. Arrastrarlo
 *     llenaba las tablas de ruido ("1,234.56 PT") sin agregar información.
 *   · **m³ con tres decimales.** Es la precisión con la que se declara el
 *     volumen ante SERFOR (GTF, Libro de Operaciones): ni más —fabricaría una
 *     exactitud que la cinta no tiene— ni menos.
 *
 * Esto es PRESENTACIÓN: los números crudos no se tocan. Los CSV/Excel siguen
 * bajando con la precisión completa para que el contador recalcule.
 */

/**
 * Redondeo a entero sin `-0`: en una columna de deltas, un "−0 PT" se lee como
 * un error de cuenta cuando en realidad es "no se movió".
 */
const entero = (v: number): number => (Math.abs(v) < 0.5 ? 0 : Math.round(v));

/** Pie tablar: entero, con separador de miles. */
export const fmtPt = (v: number): string => entero(v).toLocaleString("es-PE", { maximumFractionDigits: 0 });

/** Pie tablar con signo explícito, para las columnas de variación. */
export const fmtPtSigno = (v: number): string => (entero(v) > 0 ? `+${fmtPt(v)}` : fmtPt(v));

/** Volumen: SIEMPRE tres decimales, aunque sean ceros (0.500 ≠ 0.5 en un acta). */
export const fmtM3 = (v: number): string =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Dinero: dos decimales, como la factura. */
export const fmtSoles = (v: number): string =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dinero con signo, para las columnas de variación. */
export const fmtSolesSigno = (v: number): string => (v > 0 ? `+${fmtSoles(v)}` : fmtSoles(v));

/** Porcentajes: un decimal (más es falsa precisión sobre un reparto). */
export const fmtPct = (v: number): string =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Porcentaje con signo, en puntos porcentuales. */
export const fmtPctSigno = (v: number): string => (v > 0 ? `+${fmtPct(v)}` : fmtPct(v));

/**
 * Piezas. Cuando un grupo se parte entre dos bloques de rolliza, su conteo sale
 * prorrateado: el volumen SÍ se parte, la pieza no. El «≈» avisa que ese número
 * es un reparto — sin él, un «0.19» pelado en la columna «Piezas» se lee como
 * un error de cuenta.
 */
export const fmtPiezas = (v: number): string =>
  Number.isInteger(v) ? v.toLocaleString("es-PE") : `≈ ${v.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
