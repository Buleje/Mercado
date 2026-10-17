/**
 * ctp-radar-altura — que el bloque grande sea el que pesa.
 *
 * El radar mide volumen desde hace rato, pero lo dibujaba con bloques todos
 * iguales: una guía de 55 m³ y una de 4 ocupaban lo mismo y había que leer el
 * número para notar la diferencia. Acá el alto crece con la cantidad, así el
 * desbalance de la cadena se ve antes de leer nada.
 *
 * Las dos decisiones que evitan que el dibujo mienta:
 *
 * 1. **Cada columna se normaliza contra su propio máximo.** Un ingreso se mide
 *    en m³ y un despacho puede estar en pies tablares; hacer que compartan
 *    escala pintaría un despacho enorme al lado de su propia materia prima.
 * 2. **Si una columna mezcla unidades, no se toca ninguna altura.** Es la misma
 *    regla que ya cuida `ctp-radar-rendimiento`: comparar m³ contra pt da
 *    proporciones de fantasía. Antes que mentir, el dibujo se queda parejo.
 *
 * PURO y client-safe.
 */

/** Lo mínimo que hace falta de un nodo para asignarle alto. */
export interface NodoMedible {
  id: string;
  /** Cantidad declarada en la línea. */
  valor: number;
  /** Unidad de esa cantidad. `null` cuenta como una unidad más. */
  unidad?: string | null;
}

export interface OpcionesAltura {
  /** Alto de un bloque cuando todos miden igual. */
  base: number;
  /** Tope al que llega el bloque de la línea más grande de su columna. */
  maximo: number;
}

/**
 * Alto de cada nodo de UNA columna, por id.
 *
 * Devuelve el `base` para todos cuando no se puede comparar honestamente: sin
 * valores positivos, con una sola línea, o con unidades mezcladas.
 */
export function alturasDeColumna(
  nodos: readonly NodoMedible[],
  { base, maximo }: OpcionesAltura,
): { alturas: Map<string, number>; aplicada: boolean; motivo: "ok" | "unidades-mixtas" | "sin-datos" } {
  const alturas = new Map<string, number>();
  const parejo = (motivo: "unidades-mixtas" | "sin-datos") => {
    for (const n of nodos) alturas.set(n.id, base);
    return { alturas, aplicada: false, motivo };
  };

  if (nodos.length < 2) return parejo("sin-datos");

  // Sólo cuentan las unidades de las líneas que tienen cantidad: una línea en 0
  // no aporta a la escala y su unidad no debería descalificar a la columna.
  const unidades = new Set(
    nodos.filter((n) => Number.isFinite(n.valor) && n.valor > 0).map((n) => (n.unidad ?? "").trim().toLowerCase()),
  );
  if (unidades.size > 1) return parejo("unidades-mixtas");

  const max = Math.max(0, ...nodos.map((n) => (Number.isFinite(n.valor) ? n.valor : 0)));
  if (max <= 0) return parejo("sin-datos");

  const techo = Math.max(base, maximo);
  for (const n of nodos) {
    const v = Number.isFinite(n.valor) && n.valor > 0 ? n.valor : 0;
    // Lineal sobre el piso: con el ancho fijo, el área del bloque por encima
    // del piso queda casi proporcional a la cantidad. El piso existe porque un
    // bloque proporcional de verdad dejaría la línea chica ilegible.
    alturas.set(n.id, Math.round(base + (techo - base) * Math.min(1, v / max)));
  }
  return { alturas, aplicada: true, motivo: "ok" };
}

/** Techo sugerido: el doble y medio del alto normal, sin pasarse de la pantalla. */
export function techoDeAltura(base: number): number {
  return Math.round(Math.min(base * 2.5, base + 150));
}
