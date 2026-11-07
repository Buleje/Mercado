/**
 * hoja-calcular — resolver las fórmulas de una hoja para mostrarlas.
 *
 * Un .xlsx guarda la fórmula y, en general, también su último resultado. Pero
 * "en general" no es siempre: los archivos que genera un sistema (o los que se
 * guardaron sin recalcular) traen la fórmula SIN resultado, y la celda se veía
 * vacía. En una cotización, la columna "Subtotal" en blanco es peor que no
 * mostrar nada: parece que el archivo está mal.
 *
 * Acá se calcula lo mismo que ya calculaba el editor, y por eso vive en una
 * lib: la vista previa y el editor tienen que mostrar EL MISMO número.
 */

import { evaluarFormula } from "./hoja-formulas";
import { formatearValor, type HojaFormato } from "./xlsx-formato";

/**
 * Devuelve la hoja con el `texto` de cada celda con fórmula ya resuelto.
 *
 * @param hoja  La hoja a calcular.
 * @param libro Todas las hojas del archivo: una fórmula puede mirar a otra
 *              (`Precios!B4`), y sin el libro esa referencia daría `#¡REF!`.
 */
export function calcularHoja(hoja: HojaFormato, libro: HojaFormato[] = [hoja]): HojaFormato {
  const conFormula = hoja.filas.some((f) => f.some((c) => c.formula));
  if (!conFormula) return hoja;

  const leer = (f: number, c: number, nombre?: string) => {
    const origen = nombre === undefined || nombre.toLowerCase() === hoja.nombre.toLowerCase()
      ? hoja
      : libro.find((h) => h.nombre.toLowerCase() === nombre.toLowerCase());
    if (!origen) return null;
    const celda = origen.filas[f]?.[c];
    if (!celda) return "";
    return celda.formula ? `=${celda.formula}` : celda.crudo;
  };

  return {
    ...hoja,
    filas: hoja.filas.map((fila) => fila.map((celda) => {
      if (!celda.formula) return celda;
      const resultado = evaluarFormula(`=${celda.formula}`, leer, hoja.nombre);
      // El resultado se vuelve a vestir con el formato de la celda: si no, una
      // columna de importes pasa de "S/ 56,650.00" a "56650".
      const n = Number(resultado);
      const texto = Number.isFinite(n) && resultado !== ""
        ? formatearValor(n, celda.numFmt)
        : resultado;
      return { ...celda, texto };
    })),
  };
}
