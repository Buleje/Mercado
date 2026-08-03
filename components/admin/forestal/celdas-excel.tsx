"use client";

import { useCallback } from "react";

/**
 * Celdas con navegación de teclado tipo planilla, para cargar y corregir medidas
 * sin soltar el teclado.
 *
 * El aserradero carga cientos de piezas por día: obligar a hacer clic en cada campo
 * es lo que hace que la gente prefiera el papel. Acá se tipea el número, se pasa con
 * la flecha y se confirma con Enter.
 *
 * Cómo se ubican las celdas: cada input lleva `data-fila` y `data-col` y vive dentro
 * de un contenedor con `data-grilla="<id>"`. La navegación busca por selector en vez
 * de mantener un árbol de refs — así sobrevive al filtrado y reordenado de la tabla,
 * donde los índices cambian bajo los pies.
 */

export type CoordCelda = { fila: number; col: number };

/** Busca el input de una coordenada dentro de su grilla. */
function celdaEn(grilla: string, fila: number, col: number): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    `[data-grilla="${grilla}"] input[data-fila="${fila}"][data-col="${col}"]`
  );
}

/** Cuántas filas tiene la grilla ahora mismo (puede cambiar al filtrar). */
function filasDe(grilla: string): number[] {
  const nodos = document.querySelectorAll<HTMLInputElement>(`[data-grilla="${grilla}"] input[data-fila]`);
  const set = new Set<number>();
  nodos.forEach((n) => set.add(Number(n.dataset.fila)));
  return [...set].sort((a, b) => a - b);
}

function columnasDe(grilla: string, fila: number): number[] {
  const nodos = document.querySelectorAll<HTMLInputElement>(
    `[data-grilla="${grilla}"] input[data-fila="${fila}"][data-col]`
  );
  const cols = [...nodos].map((n) => Number(n.dataset.col));
  return cols.sort((a, b) => a - b);
}

/** Mueve el foco y deja el valor seleccionado, para que tipear lo reemplace. */
export function enfocarCelda(grilla: string, fila: number, col: number): boolean {
  const el = celdaEn(grilla, fila, col);
  if (!el) return false;
  el.focus();
  // Sincrónico a propósito: con un `requestAnimationFrame` el select() puede caer
  // DESPUÉS de que la persona ya empezó a tipear, dejando el texto reseleccionado y
  // el cursor en 0 — y ahí la flecha derecha dejaba de avanzar de celda.
  try {
    el.select();
  } catch {
    /* algunos navegadores no permiten select() en ciertos tipos de input */
  }
  return true;
}

/** ¿Todo el contenido está seleccionado? Entonces no se está editando en el medio. */
function todoSeleccionado(el: HTMLInputElement): boolean {
  const largo = el.value.length;
  return largo > 0 && el.selectionStart === 0 && el.selectionEnd === largo;
}

/**
 * ¿El cursor está pegado al final? Sólo ahí la flecha derecha salta de celda: si no,
 * sería imposible corregir un "12" mal tipeado.
 *
 * Con el valor entero seleccionado también cuenta como borde — es el estado en el que
 * queda una celda recién enfocada, y ahí la flecha tiene que seguir avanzando.
 */
function cursorAlFinal(el: HTMLInputElement): boolean {
  // Los input[type=number] no exponen selectionStart: se los trata como "siempre al borde",
  // que es el comportamiento útil para navegar entre medidas.
  if (el.type === "number") return true;
  if (todoSeleccionado(el)) return true;
  return el.selectionStart === null || el.selectionStart >= el.value.length;
}

function cursorAlInicio(el: HTMLInputElement): boolean {
  if (el.type === "number") return true;
  if (todoSeleccionado(el)) return true;
  return el.selectionStart === null || el.selectionStart <= 0;
}

export type OpcionesGrilla = {
  /** Id del contenedor (`data-grilla`). */
  grilla: string;
  /** Enter en la última columna, o en cualquiera si `enterSiempreConfirma`. */
  onConfirmar?: (coord: CoordCelda) => void;
  /** Enter confirma desde cualquier columna, no sólo la última. */
  enterSiempreConfirma?: boolean;
  /** Ctrl/Cmd + Supr sobre la fila. */
  onEliminarFila?: (fila: number) => void;
  /** Ctrl/Cmd + D sobre la fila. */
  onDuplicarFila?: (fila: number) => void;
};

/**
 * Devuelve el `onKeyDown` para las celdas de una grilla.
 *
 * Reglas:
 * - `→` / `←` saltan de columna, pero SOLO con el cursor en el borde del texto:
 *   si no, sería imposible corregir un "12" mal tipeado.
 * - `↑` / `↓` cambian de fila en la misma columna.
 * - `Enter` confirma (y en la fila de carga vuelve al principio).
 * - `Escape` suelta el foco.
 */
export function useTecladoGrilla(op: OpcionesGrilla) {
  const { grilla, onConfirmar, enterSiempreConfirma, onEliminarFila, onDuplicarFila } = op;

  return useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      const fila = Number(el.dataset.fila);
      const col = Number(el.dataset.col);
      if (Number.isNaN(fila) || Number.isNaN(col)) return;

      const cols = columnasDe(grilla, fila);
      const filas = filasDe(grilla);
      const iCol = cols.indexOf(col);
      const iFila = filas.indexOf(fila);

      // Atajos de fila (antes que la navegación: llevan modificador).
      if ((e.ctrlKey || e.metaKey) && (e.key === "Delete" || e.key === "Backspace")) {
        if (onEliminarFila) {
          e.preventDefault();
          onEliminarFila(fila);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        if (onDuplicarFila) {
          e.preventDefault();
          onDuplicarFila(fila);
        }
        return;
      }

      switch (e.key) {
        case "ArrowRight": {
          if (!cursorAlFinal(el)) return;
          const sig = cols[iCol + 1];
          if (sig === undefined) return;
          e.preventDefault();
          enfocarCelda(grilla, fila, sig);
          break;
        }
        case "ArrowLeft": {
          if (!cursorAlInicio(el)) return;
          const ant = cols[iCol - 1];
          if (ant === undefined) return;
          e.preventDefault();
          enfocarCelda(grilla, fila, ant);
          break;
        }
        case "ArrowDown": {
          const sig = filas[iFila + 1];
          if (sig === undefined) return;
          e.preventDefault();
          enfocarCelda(grilla, sig, col);
          break;
        }
        case "ArrowUp": {
          const ant = filas[iFila - 1];
          if (ant === undefined) return;
          e.preventDefault();
          enfocarCelda(grilla, ant, col);
          break;
        }
        case "Enter": {
          const esUltima = iCol === cols.length - 1;
          if (onConfirmar && (enterSiempreConfirma || esUltima)) {
            e.preventDefault();
            onConfirmar({ fila, col });
            return;
          }
          // En una tabla, Enter baja de fila como en una planilla.
          const sig = filas[iFila + 1];
          if (sig !== undefined) {
            e.preventDefault();
            enfocarCelda(grilla, sig, col);
          }
          break;
        }
        case "Escape":
          el.blur();
          break;
      }
    },
    [grilla, onConfirmar, enterSiempreConfirma, onEliminarFila, onDuplicarFila]
  );
}

/**
 * Input de una celda: acepta tipeo libre y ofrece los valores habituales como
 * sugerencia, en vez del `<select>` que obligaba a soltar el teclado.
 */
export function CeldaNum({
  valor,
  onValor,
  fila,
  col,
  onKeyDown,
  etiqueta,
  sugerencias,
  listaId,
  ancho = "w-20",
  alto = "h-10",
  className = "",
  placeholder,
}: {
  valor: string;
  onValor: (v: string) => void;
  fila: number;
  col: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  etiqueta: string;
  sugerencias?: number[];
  listaId?: string;
  ancho?: string;
  alto?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        placeholder={placeholder}
        aria-label={etiqueta}
        data-fila={fila}
        data-col={col}
        list={listaId}
        onChange={(e) => {
          // Solo números, punto y coma decimal: el resto no es una medida.
          const limpio = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
          onValor(limpio);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.currentTarget.select()}
        className={`${ancho} ${alto} rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-center font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25 ${className}`}
      />
      {listaId && sugerencias && (
        <datalist id={listaId}>
          {sugerencias.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
    </>
  );
}
