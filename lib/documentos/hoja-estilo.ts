/**
 * hoja-estilo — el formato del archivo traducido a CSS.
 *
 * Vive acá y no dentro de la grilla del editor porque la vista previa del drive
 * tiene que pintar la planilla EXACTAMENTE igual: si cada una tuviera su copia,
 * la celda con relleno amarillo se vería de un color en el visor y de otro al
 * editarla, y el arreglo de modo oscuro habría que hacerlo dos veces.
 */

import type { CSSProperties } from "react";
import { colorMuyOscuro, type CeldaHoja } from "./xlsx-formato";
import { ptAPx } from "./hoja-metricas";

/**
 * Estilo de una celda tal como viene del archivo.
 *
 * @param tema  Tema resuelto de la app: decide si un color de letra oscuro
 *              fijado por el archivo se respeta o se ignora.
 * @param zoom  Escala de la vista (1 = 100%).
 */
export function estiloDeCeldaCss(celda: CeldaHoja, tema: "light" | "dark", zoom = 1): CSSProperties {
  const e = celda.estilo;
  // Excel alinea el contenido ABAJO de la celda cuando no se dice otra cosa;
  // con el centrado del navegador, una fila alta se ve flotando.
  if (!e) return { verticalAlign: "bottom" };
  return {
    fontWeight: e.negrita ? 700 : undefined,
    fontStyle: e.cursiva ? "italic" : undefined,
    textDecoration: e.subrayado ? "underline" : undefined,
    // Un color de letra oscuro fijado por el archivo, en una celda SIN relleno
    // propio, sería ilegible en modo oscuro: ahí manda el color del tema. Si la
    // celda tiene su propio fondo, el color del archivo se respeta tal cual.
    color: tema === "dark" && !e.fondo && e.color && colorMuyOscuro(e.color)
      ? undefined
      : e.color,
    backgroundColor: e.fondo,
    // El tamaño del archivo está en PUNTOS: aplicarlo como píxeles hacía que
    // un título de 16 pt se viera igual de chico que el texto normal.
    fontSize: e.tamano ? `${ptAPx(e.tamano) * zoom}px` : undefined,
    textAlign: e.alineacion,
    verticalAlign: e.alineacionVertical ?? "bottom",
    whiteSpace: e.ajustarTexto ? "normal" : undefined,
    borderTopColor: e.bordes?.arriba ? "var(--rule-strong)" : undefined,
    borderBottomColor: e.bordes?.abajo ? "var(--rule-strong)" : undefined,
    borderLeftColor: e.bordes?.izq ? "var(--rule-strong)" : undefined,
    borderRightColor: e.bordes?.der ? "var(--rule-strong)" : undefined,
  };
}
