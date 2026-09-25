/**
 * hoja-reglas — resaltar por regla ("todo lo que baje de 5 en rojo").
 *
 * Lo que un dueño hace a mano cuando revisa un inventario: buscar lo que está
 * por debajo del mínimo y pintarlo. Con 300 filas, a mano no se hace.
 *
 * IMPORTANTE — esto NO es el "formato condicional" de Excel: pinta las celdas
 * que cumplen la regla EN ESE MOMENTO y el color queda fijo en el archivo (por
 * eso se puede deshacer con Ctrl+Z y sobrevive abriéndolo en cualquier lado).
 * Si después cambian los datos, hay que volver a aplicarla. La UI lo dice así,
 * sin prometer lo que no hace.
 */

import type { CeldaHoja } from "./xlsx-formato";
import type { RangoNormal } from "./hoja-rango";
import { comoNumeroVisible } from "./hoja-analisis";

export type Comparador = "mayor" | "menor" | "igual" | "contiene" | "vacia";

export interface Regla {
  comparador: Comparador;
  /** Referencia: número o texto según el comparador. Vacío para "vacia". */
  valor: string;
}

/** Colores ofrecidos: los cuatro que se usan de verdad para marcar. */
export const COLORES_REGLA = [
  { nombre: "Rojo", hex: "#fecaca" },
  { nombre: "Amarillo", hex: "#fef08a" },
  { nombre: "Verde", hex: "#bbf7d0" },
  { nombre: "Celeste", hex: "#bfdbfe" },
] as const;

function cumple(celda: CeldaHoja, regla: Regla): boolean {
  const texto = (celda.texto ?? "").trim();

  if (regla.comparador === "vacia") return texto === "";
  if (texto === "") return false;

  if (regla.comparador === "contiene") {
    return regla.valor.trim() !== "" && texto.toLowerCase().includes(regla.valor.trim().toLowerCase());
  }

  const referenciaNum = Number(regla.valor.replace(",", "."));
  const valorNum = comoNumeroVisible(celda);

  // Comparar números como números; si alguno de los dos no lo es, sólo tiene
  // sentido la igualdad de texto ("mayor que" entre palabras no significa nada
  // para quien mira una planilla).
  if (valorNum !== null && Number.isFinite(referenciaNum)) {
    if (regla.comparador === "mayor") return valorNum > referenciaNum;
    if (regla.comparador === "menor") return valorNum < referenciaNum;
    return valorNum === referenciaNum;
  }
  return regla.comparador === "igual" && texto.toLowerCase() === regla.valor.trim().toLowerCase();
}

/** Las celdas del rango que cumplen la regla (las combinadas tapadas no cuentan). */
export function celdasQueCumplen(
  filas: CeldaHoja[][],
  rango: RangoNormal,
  regla: Regla,
): { fila: number; columna: number }[] {
  const out: { fila: number; columna: number }[] = [];
  for (let f = rango.filaIni; f <= rango.filaFin; f++) {
    for (let c = rango.colIni; c <= rango.colFin; c++) {
      const celda = filas[f]?.[c];
      if (!celda || celda.tapada) continue;
      if (cumple(celda, regla)) out.push({ fila: f, columna: c });
    }
  }
  return out;
}

/** Texto de la regla para mostrarla en la UI ("menor que 5"). */
export function describirRegla(regla: Regla): string {
  switch (regla.comparador) {
    case "mayor": return `mayor que ${regla.valor || "…"}`;
    case "menor": return `menor que ${regla.valor || "…"}`;
    case "igual": return `igual a ${regla.valor || "…"}`;
    case "contiene": return `contiene "${regla.valor}"`;
    case "vacia": return "está vacía";
  }
}
