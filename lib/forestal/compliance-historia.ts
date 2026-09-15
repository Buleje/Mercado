/**
 * La historia del cumplimiento, en aritmética pura (ADR-384).
 *
 * Lo que decide si el gráfico dice la verdad no es el gráfico: es cómo se
 * arma su serie. Estas dos funciones son ese punto, y viven acá para poder
 * probarlas sin navegador.
 *
 * PURO: sin React ni fetch.
 */

/** Lo mínimo de un snapshot para graficarlo y comparar. */
export interface PuntoHistoria {
  /** `yyyy-mm-dd`. */
  fecha: string;
  score: number;
}

const DIA_MS = 86_400_000;

const t = (f: string): number => Date.parse(`${f}T00:00:00Z`);

/** Días de calendario entre dos `yyyy-mm-dd`. */
export const diasEntre = (a: string, b: string): number => Math.round((t(b) - t(a)) / DIA_MS);

/**
 * Una entrada por día de calendario entre el primer y el último punto, con
 * `score: null` en los días sin medición.
 *
 * Sin esto el eje X de Recharts es CATEGÓRICO: seis puntos medidos el 26, 27,
 * 30, 1, 3 y 4 se dibujan equidistantes y la línea afirma una cadencia diaria
 * que no existió. Con los huecos explícitos el eje es el calendario real y la
 * línea se corta donde nadie miró (`connectNulls` de Recharts es false por
 * defecto) — que es la verdad de este dato, y este libro es fiscalizable.
 *
 * Se densifica sólo entre el primero y el último, no sobre los 90 días de la
 * ventana: un libro con tres mediciones no tiene que dibujar 87 casilleros
 * vacíos para decir lo mismo.
 */
export function densificarPorDia<T extends PuntoHistoria>(
  serie: readonly T[],
): { fecha: string; score: number | null }[] {
  if (serie.length === 0) return [];
  const por = new Map(serie.map((p) => [p.fecha, p.score]));
  const out: { fecha: string; score: number | null }[] = [];
  const fin = t(serie[serie.length - 1].fecha);
  for (let d = t(serie[0].fecha); d <= fin; d += DIA_MS) {
    const f = new Date(d).toISOString().slice(0, 10);
    out.push({ fecha: f, score: por.get(f) ?? null });
  }
  return out;
}

/** Cuántos tramos de la serie tienen días sin medir en el medio. */
export function tramosSinMedir(serie: readonly PuntoHistoria[]): number {
  let n = 0;
  for (let i = 1; i < serie.length; i++) if (diasEntre(serie[i - 1].fecha, serie[i].fecha) > 1) n++;
  return n;
}

/**
 * Qué categoría movió el score entre las dos últimas mediciones, de mayor a
 * menor movimiento.
 *
 * El delta del score solo no sirve para actuar: «bajó de 92 a 74» no dice qué
 * hacer. Lo accionable es «aparecieron 4 ingresos fuera de plazo».
 */
export function queCambio<K extends string>(
  serie: readonly Record<K | "fecha", string | number>[],
  categorias: readonly { key: K; label: string }[],
): { label: string; delta: number }[] {
  if (serie.length < 2) return [];
  const antes = serie[serie.length - 2];
  const ahora = serie[serie.length - 1];
  return categorias
    .map(({ key, label }) => ({ label, delta: Number(ahora[key] ?? 0) - Number(antes[key] ?? 0) }))
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
