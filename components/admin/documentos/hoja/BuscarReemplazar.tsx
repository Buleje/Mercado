"use client";

/**
 * BuscarReemplazar — encontrar un valor en la hoja y, si hace falta, cambiarlo
 * en todas partes de una vez.
 *
 * En un catálogo de cientos de filas es la diferencia entre corregir un nombre
 * de proveedor en diez segundos o revisar la planilla a ojo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "@buleje/design-system/icons";
import type { HojaFormato } from "@/lib/documentos/xlsx-formato";
import type { Punto } from "@/lib/documentos/hoja-rango";

export interface Coincidencia extends Punto { valor: string }

/** Todas las celdas cuyo contenido contiene el texto buscado. */
export function buscarEnHoja(hoja: HojaFormato, texto: string, sensible: boolean): Coincidencia[] {
  if (!texto) return [];
  const aguja = sensible ? texto : texto.toLowerCase();
  const out: Coincidencia[] = [];
  hoja.filas.forEach((fila, f) => {
    fila.forEach((celda, c) => {
      if (celda.tapada) return;
      // Se busca sobre lo que el usuario VE, que es lo que recuerda haber escrito.
      const pajar = sensible ? celda.texto : celda.texto.toLowerCase();
      if (pajar && pajar.includes(aguja)) out.push({ fila: f, columna: c, valor: celda.crudo });
    });
  });
  return out;
}

export default function BuscarReemplazar({
  hoja, onIr, onReemplazar, onCerrar,
}: {
  hoja: HojaFormato;
  onIr: (p: Punto) => void;
  onReemplazar: (celdas: { fila: number; columna: number; valor: string }[]) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [porQue, setPorQue] = useState("");
  const [sensible, setSensible] = useState(false);
  const [indice, setIndice] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { entrada.current?.focus(); }, []);

  const coincidencias = useMemo(() => buscarEnHoja(hoja, texto, sensible), [hoja, texto, sensible]);

  useEffect(() => {
    if (coincidencias.length > 0) onIr(coincidencias[Math.min(indice, coincidencias.length - 1)]);
    // `onIr` cambia en cada render del padre; seguirlo dispararía un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coincidencias, indice]);

  const mover = (delta: number) => {
    if (coincidencias.length === 0) return;
    setIndice((i) => (i + delta + coincidencias.length) % coincidencias.length);
  };

  const reemplazarTodo = () => {
    if (coincidencias.length === 0) return;
    const re = new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), sensible ? "g" : "gi");
    onReemplazar(coincidencias.map((c) => ({
      fila: c.fila, columna: c.columna,
      valor: (c.valor || "").replace(re, porQue),
    })));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <input
        ref={entrada}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setIndice(0); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); mover(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape") onCerrar();
        }}
        placeholder="Buscar en la hoja…"
        aria-label="Buscar en la hoja"
        className="h-9 w-48 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <span className="min-w-[5rem] text-xs font-semibold text-[var(--text-tertiary)]">
        {texto === "" ? "" : coincidencias.length === 0 ? "Sin resultados" : `${Math.min(indice + 1, coincidencias.length)} de ${coincidencias.length}`}
      </span>
      <button type="button" onClick={() => mover(-1)} title="Anterior (Shift+Enter)"
        className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
        <ChevronUp className="h-4 w-4" aria-hidden /><span className="sr-only">Anterior</span>
      </button>
      <button type="button" onClick={() => mover(1)} title="Siguiente (Enter)"
        className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
        <ChevronDown className="h-4 w-4" aria-hidden /><span className="sr-only">Siguiente</span>
      </button>

      <input
        value={porQue}
        onChange={(e) => setPorQue(e.target.value)}
        placeholder="Reemplazar por…"
        aria-label="Reemplazar por"
        className="h-9 w-44 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <button
        type="button"
        onClick={reemplazarTodo}
        disabled={coincidencias.length === 0}
        className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-40"
      >
        Reemplazar {coincidencias.length > 0 ? `(${coincidencias.length})` : "todo"}
      </button>

      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
        <input type="checkbox" checked={sensible} onChange={(e) => setSensible(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Distinguir mayúsculas
      </label>

      <button type="button" onClick={onCerrar} title="Cerrar (Esc)"
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]">
        <X className="h-4 w-4" aria-hidden /><span className="sr-only">Cerrar</span>
      </button>
    </div>
  );
}
