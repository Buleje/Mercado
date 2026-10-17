/**
 * Volver una medida del libro a la escala en que se midió en la sierra.
 * Sacada de `CtpResumenDeJornadasModal` (2026-09-23) para que la escuadría del
 * paquete la use sin importar un modal.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Devolver la medida a la escala en que se midió.
 *
 * El libro guarda cm y metros con **2 decimales**, y 8 pies son 2.4384 m: lo
 * guardado es 2.44, y al volver da 8.0052 → «8.01 pies». Medido de verdad en la
 * corrida N° 28: salían 4.99, 6.99, 8.01 y 1.51. Nadie corta a 8.01 pies, y una
 * planilla llena de esos números se lee como si el sistema no supiera medir.
 *
 * Se acerca al múltiplo de `paso` SÓLO si está a menos de `tolerancia`, y la
 * tolerancia sale del error que mete el libro, no de un número redondo: 0.005 m
 * de redondeo son 0.017 pies, y 0.005 cm son 0.002 pulgadas. Con eso, 8.0052
 * pies vuelve a 8 y una medida que de verdad es otra se queda como está — 8.25
 * pies sigue siendo 8.25, y 2.7 pulgadas no se convierte en 2¾.
 */
export function acercarAEscala(valor: number, paso: number, tolerancia: number): number {
  const cerca = Math.round(valor / paso) * paso;
  return Math.abs(valor - cerca) <= tolerancia ? r2(cerca) : r2(valor);
}

