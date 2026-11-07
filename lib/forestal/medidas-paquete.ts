/**
 * medidas-paquete — leer "5.08 X 20.32 X 3.05" como espesor, ancho y largo.
 *
 * El inventario de aserrada del SNIFFS trae las dimensiones en una sola celda
 * de texto, y con formatos que cambian entre aserraderos: dos números (espesor
 * por ancho, el largo va aparte), tres (con el largo), separadas por `X`, `x` o
 * `*`, con coma o punto decimal, y muchas veces `0 X 0 X 0` cuando el paquete
 * no está dimensionado.
 *
 * Sin esto, la columna MEDIDAS de "Productos disponibles" queda en `—` para
 * todo lo importado: el dato está en el archivo y se tiraba al leerlo.
 */

export interface MedidasPaquete {
  /** Espesor de la pieza tipo, en cm. */
  espesorCm: number | null;
  /** Ancho de la pieza tipo, en cm. */
  anchoCm: number | null;
  /** Largo de la pieza tipo, en metros. */
  largoM: number | null;
}

/** Un número del formato: acepta coma decimal y descarta lo que no es número. */
function aNumero(bruto: string): number | null {
  const limpio = bruto.trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parte la celda de dimensiones. Devuelve `null` cuando no hay nada que leer
 * (celda vacía, `-`, o el `0 X 0 X 0` con el que el formato dice "sin medidas").
 *
 * Con DOS números se asume `espesor X ancho` —es como lo escribe el SNIFFS— y
 * el largo queda en `null`: inventarlo sería declarar una pieza que nadie midió.
 */
export function medidasDeTexto(texto: string | null | undefined): MedidasPaquete | null {
  if (!texto) return null;
  const partes = texto
    .split(/[x*×]/i)
    .map((p) => p.replace(/[^\d.,-]/g, ""))
    .map(aNumero)
    .filter((n): n is number => n !== null);

  if (partes.length < 2) return null;
  // Todo en cero es cómo el formato escribe "no está dimensionado".
  if (partes.every((n) => n === 0)) return null;

  const [espesor, ancho, largo] = partes;
  const positivo = (n: number | undefined) => (typeof n === "number" && n > 0 ? n : null);
  const medidas: MedidasPaquete = {
    espesorCm: positivo(espesor),
    anchoCm: positivo(ancho),
    largoM: positivo(largo),
  };
  return medidas.espesorCm || medidas.anchoCm || medidas.largoM ? medidas : null;
}
