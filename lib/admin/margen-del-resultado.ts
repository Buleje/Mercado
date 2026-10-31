/**
 * Margen = resultado ÷ ingresos, en %. Un solo lugar para la tarjeta
 * «Resultado del mes» de Inicio y el indicador «Margen %» de Mi Plata: antes
 * cada uno lo sacaba a su modo y sólo la tarjeta tenía tope.
 *
 * `null` = no se muestra. Sin ingresos no hay de qué sacar el porcentaje, y con
 * ingresos casi en cero se dispara (medido 09-10 en main: S/ 0,10 de ingresos y
 * S/ 18,29 de costos = −18 190 %). Pasado ±999 % el número no dice nada.
 */
export const TOPE_MARGEN = 999;

export function margenDelResultado(resultado: number, ingresos: number): number | null {
  if (!Number.isFinite(resultado) || !Number.isFinite(ingresos) || ingresos <= 0) return null;
  const crudo = (resultado / ingresos) * 100;
  return Math.abs(crudo) <= TOPE_MARGEN ? crudo : null;
}
