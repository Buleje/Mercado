"use client";

/**
 * FiltroColumna — elegir qué valores de una columna quedan a la vista.
 *
 * El filtro es SÓLO DE PANTALLA: no cambia el archivo ni borra nada, sólo
 * esconde filas mientras se mira. Por eso la barra de estado dice cuántas
 * quedaron ocultas — un filtro olvidado que hace parecer que faltan datos es
 * un problema clásico de las planillas.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Search, X } from "@buleje/design-system/icons";
import { valoresDeColumna } from "@/lib/documentos/hoja-analisis";
import type { CeldaHoja } from "@/lib/documentos/xlsx-formato";

export default function FiltroColumna({
  filas, columna, etiqueta, desdeFila, seleccionados, onAplicar, onCerrar,
}: {
  filas: CeldaHoja[][];
  columna: number;
  /** Letra de la columna, para el título. */
  etiqueta: string;
  /** Desde qué fila hay datos (debajo del encabezado). */
  desdeFila: number;
  /** Valores visibles ahora; `null` = sin filtro (todos). */
  seleccionados: Set<string> | null;
  onAplicar: (valores: Set<string> | null) => void;
  onCerrar: () => void;
}) {
  const valores = useMemo(() => valoresDeColumna(filas, columna, desdeFila), [filas, columna, desdeFila]);
  const [busqueda, setBusqueda] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => seleccionados ? new Set(seleccionados) : new Set(valores.map((v) => v.valor)),
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? valores.filter((v) => v.valor.toLowerCase().includes(q)) : valores;
  }, [valores, busqueda]);

  const alternar = (valor: string) => {
    setElegidos((prev) => {
      const copia = new Set(prev);
      if (copia.has(valor)) copia.delete(valor);
      else copia.add(valor);
      return copia;
    });
  };

  const todosElegidos = elegidos.size === valores.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onCerrar}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Filtrar la columna ${etiqueta}`}
        className="flex max-h-[80vh] w-full max-w-[24rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b-2 border-[var(--rule-base)] px-4 py-3">
          <CardTitle as="h2">Filtrar por la columna {etiqueta}</CardTitle>
          <button type="button" onClick={onCerrar} title="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]">
            <X className="h-4 w-4" aria-hidden /><span className="sr-only">Cerrar</span>
          </button>
        </div>

        <div className="border-b border-[var(--rule-base)] p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar un valor…"
              aria-label="Buscar un valor de la columna"
              className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setElegidos(todosElegidos ? new Set() : new Set(valores.map((v) => v.valor)))}
            className="mt-2 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            {todosElegidos ? "Quitar todos" : "Seleccionar todos"}
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibles.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-[var(--text-tertiary)]">
              Ningún valor coincide con “{busqueda}”.
            </li>
          )}
          {visibles.map(({ valor, cantidad }) => {
            const marcado = elegidos.has(valor);
            return (
              <li key={valor || "(vacías)"}>
                <button
                  type="button"
                  onClick={() => alternar(valor)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-sunken)]"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                    marcado ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--rule-strong)]"
                  }`}>
                    {marcado && <Check className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <span className={`flex-1 truncate ${valor === "" ? "italic text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                    {valor === "" ? "(vacías)" : valor}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{cantidad}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t-2 border-[var(--rule-base)] px-4 py-3">
          <button
            type="button"
            onClick={() => { onAplicar(null); onCerrar(); }}
            className="text-xs font-bold text-[var(--text-secondary)] hover:underline"
          >
            Quitar el filtro
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar}
              className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => { onAplicar(todosElegidos ? null : elegidos); onCerrar(); }}
              className="h-10 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)]"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
