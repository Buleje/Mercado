/**
 * comparar — qué cambió entre dos versiones de un documento.
 *
 * El historial decía "v3 · 12.4 KB · hace 2 días": el tamaño no contesta la
 * única pregunta que importa cuando alguien duda de un archivo — *qué* se
 * tocó. Con una lista de precios de 300 filas, la respuesta se buscaba
 * bajando las dos versiones y abriéndolas al lado.
 *
 * Acá se comparan los CONTENIDOS:
 *  - planillas, celda por celda (con su dirección: "C14: 28.90 → 31.50");
 *  - documentos de texto, párrafo por párrafo (con un diff clásico).
 *
 * Todo es puro y sin dependencias: la UI sólo dibuja lo que sale de acá.
 */

import type { CeldaHoja, HojaFormato } from "./xlsx-formato";
import { numeroALetra } from "./xlsx-formato";

// ── Planillas ────────────────────────────────────────────────────────────────

export interface CambioCelda {
  /** Dirección estilo Excel: "C14". */
  ref: string;
  fila: number;
  columna: number;
  antes: string;
  despues: string;
}

export interface DiffHoja {
  nombre: string;
  /** La hoja no existía antes / ya no existe. */
  estado: "igual" | "cambiada" | "agregada" | "quitada";
  cambios: CambioCelda[];
  filasAgregadas: number;
  filasQuitadas: number;
  /** Cuántos cambios se recortaron por el tope. */
  recortados: number;
}

export interface DiffLibro {
  hojas: DiffHoja[];
  total: number;
}

/** Tope de cambios listados por hoja: más que esto ya no se lee, se resume. */
const MAX_CAMBIOS = 200;

function textoDe(celda: CeldaHoja | undefined): string {
  return (celda?.texto ?? "").trim();
}

/** Compara dos versiones de un libro, hoja por hoja y celda por celda. */
export function compararLibros(antes: HojaFormato[], despues: HojaFormato[]): DiffLibro {
  const nombres: string[] = [];
  for (const h of [...antes, ...despues]) if (!nombres.includes(h.nombre)) nombres.push(h.nombre);

  const hojas: DiffHoja[] = [];
  let total = 0;

  for (const nombre of nombres) {
    const a = antes.find((h) => h.nombre === nombre);
    const b = despues.find((h) => h.nombre === nombre);

    if (!a || !b) {
      hojas.push({
        nombre,
        estado: a ? "quitada" : "agregada",
        cambios: [],
        filasAgregadas: b ? b.filas.length : 0,
        filasQuitadas: a ? a.filas.length : 0,
        recortados: 0,
      });
      total += (a ?? b)!.filas.length;
      continue;
    }

    const cambios: CambioCelda[] = [];
    let recortados = 0;
    const columnas = Math.max(
      ...a.filas.map((f) => f.length),
      ...b.filas.map((f) => f.length),
      0,
    );

    // Sólo el rango COMÚN se compara celda por celda; lo que sobra de una u
    // otra versión se cuenta como filas agregadas o quitadas (si no, agregar
    // una fila arriba marcaría toda la planilla como cambiada).
    const filasComunes = Math.min(a.filas.length, b.filas.length);
    for (let f = 0; f < filasComunes; f++) {
      for (let c = 0; c < columnas; c++) {
        const va = textoDe(a.filas[f]?.[c]);
        const vb = textoDe(b.filas[f]?.[c]);
        if (va === vb) continue;
        if (cambios.length >= MAX_CAMBIOS) { recortados++; continue; }
        cambios.push({ ref: `${numeroALetra(c + 1)}${f + 1}`, fila: f, columna: c, antes: va, despues: vb });
      }
    }

    const filasAgregadas = Math.max(0, b.filas.length - a.filas.length);
    const filasQuitadas = Math.max(0, a.filas.length - b.filas.length);
    const cuenta = cambios.length + recortados + filasAgregadas + filasQuitadas;
    total += cuenta;

    hojas.push({
      nombre,
      estado: cuenta === 0 ? "igual" : "cambiada",
      cambios,
      filasAgregadas,
      filasQuitadas,
      recortados,
    });
  }

  return { hojas, total };
}

// ── Texto ────────────────────────────────────────────────────────────────────

export type TipoLinea = "igual" | "agregada" | "quitada";

export interface LineaDiff {
  tipo: TipoLinea;
  texto: string;
}

/**
 * Diff de párrafos por subsecuencia común más larga (LCS).
 *
 * Es el mismo algoritmo que usa `diff` de toda la vida: encuentra lo que
 * sobrevivió y marca el resto. Compararlos por posición sería más barato, pero
 * insertar un párrafo al principio haría aparecer TODO el documento como
 * cambiado, que es exactamente lo que hace inútil a un diff.
 *
 * La tabla es O(n×m): con documentos largos se corta y se cae a una
 * comparación por posición, que para ese tamaño ya nadie lee línea por línea.
 */
export function compararTextos(antes: string[], despues: string[]): LineaDiff[] {
  const n = antes.length, m = despues.length;
  if (n * m > 1_000_000) return diffPorPosicion(antes, despues);

  // tabla[i][j] = largo de la subsecuencia común de antes[i..] y despues[j..]
  const tabla: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tabla[i][j] = antes[i] === despues[j]
        ? tabla[i + 1][j + 1] + 1
        : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
    }
  }

  const salida: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (antes[i] === despues[j]) { salida.push({ tipo: "igual", texto: antes[i] }); i++; j++; }
    else if (tabla[i + 1][j] >= tabla[i][j + 1]) { salida.push({ tipo: "quitada", texto: antes[i] }); i++; }
    else { salida.push({ tipo: "agregada", texto: despues[j] }); j++; }
  }
  while (i < n) salida.push({ tipo: "quitada", texto: antes[i++] });
  while (j < m) salida.push({ tipo: "agregada", texto: despues[j++] });
  return salida;
}

function diffPorPosicion(antes: string[], despues: string[]): LineaDiff[] {
  const salida: LineaDiff[] = [];
  const largo = Math.max(antes.length, despues.length);
  for (let i = 0; i < largo; i++) {
    const a = antes[i], b = despues[i];
    if (a === b && a !== undefined) { salida.push({ tipo: "igual", texto: a }); continue; }
    if (a !== undefined) salida.push({ tipo: "quitada", texto: a });
    if (b !== undefined) salida.push({ tipo: "agregada", texto: b });
  }
  return salida;
}

/** Cuántas líneas entraron, salieron y quedaron igual. */
export function resumenTexto(lineas: LineaDiff[]): { agregadas: number; quitadas: number; iguales: number } {
  let agregadas = 0, quitadas = 0, iguales = 0;
  for (const l of lineas) {
    if (l.tipo === "agregada") agregadas++;
    else if (l.tipo === "quitada") quitadas++;
    else iguales++;
  }
  return { agregadas, quitadas, iguales };
}
