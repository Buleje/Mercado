"use client";

/**
 * Una medida corregible de una troza ya anotada a mano (D1, D2, largo o
 * cantidad), como celda de planilla: lleva `data-fila`/`data-col` para que las
 * flechas del cubicador (`useTecladoGrilla`, `celdas-excel`) pasen de una a otra.
 *
 * Mientras se tipea guarda el texto tal cual («45,» a medio escribir) y, cada
 * vez que lo tipeado es válido, lo pasa a la fila: el volumen se recalcula al
 * toque. Al salir con algo que no va, vuelve a lo último válido y avisa por
 * `onError` — la guía imprime lo que hay en la fila, nunca un número a medias.
 */

import { useState, type KeyboardEvent } from "react";
import {
  numeroConComa,
  revisarCeldaAMano,
  type MedidaEditable,
} from "@/lib/forestal/loth-trozas-a-mano-planilla";
import type { TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";

/** El contenedor de la planilla: la lista de lo anotado y la fila de alta, una sola grilla. */
export const GRILLA_A_MANO = "trozas-a-mano";
/** Columnas de la grilla: D1, D2, largo, cantidad (la fila de alta usa las mismas). */
export const COLUMNAS_A_MANO = [0, 1, 2, 3] as const;
/** A 400 px las medidas van debajo del código, en otras celdas: otras columnas para no confundirlas. */
export const COLUMNAS_A_MANO_MOVIL = [10, 11, 12, 13] as const;
export const MEDIDAS_EDITABLES: readonly MedidaEditable[] = ["d1", "d2", "largo", "cantidad"];

const VALOR: Record<MedidaEditable, (f: TrozaAMano) => number> = {
  d1: (f) => f.d1Cm,
  d2: (f) => f.d2Cm,
  largo: (f) => f.largoM,
  cantidad: (f) => f.cantidad,
};

export function CeldaAMano({
  fila,
  campo,
  filaGrilla,
  col,
  otrasTrozas,
  etiqueta,
  onCambio,
  onError,
  onKeyDown,
  className = "",
}: {
  fila: TrozaAMano;
  campo: MedidaEditable;
  /** Posición de la fila en la grilla (0 = la primera anotada). */
  filaGrilla: number;
  col: number;
  /** Trozas de la guía sin esta fila (para el tope de la cantidad). */
  otrasTrozas: number;
  etiqueta: string;
  onCambio: (cambio: Partial<TrozaAMano>) => void;
  onError: (mensaje: string | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actual = numeroConComa(VALOR[campo](fila));
  return (
    <input
      type="text"
      inputMode={campo === "cantidad" ? "numeric" : "decimal"}
      autoComplete="off"
      value={borrador ?? actual}
      aria-label={etiqueta}
      data-fila={filaGrilla}
      data-col={col}
      data-qa={`celda-${campo}`}
      onFocus={(e) => {
        setBorrador(actual);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const texto = e.target.value;
        setBorrador(texto);
        const r = revisarCeldaAMano(fila, campo, texto, otrasTrozas);
        setError(r.ok ? null : r.error);
        if (r.ok) {
          onCambio(r.cambio);
          onError(null);
        }
      }}
      onBlur={() => {
        /* Lo que no va no se queda: vuelve a lo último válido y se dice por qué. */
        if (error) onError(`${etiqueta}: ${error}. Quedó ${actual}.`);
        setBorrador(null);
        setError(null);
      }}
      onKeyDown={onKeyDown}
      className={`h-11 w-full min-w-0 rounded-lg border-[1.5px] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] ${
        error ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]"
      } ${className}`}
    />
  );
}
