"use client";

/**
 * reparto-filtro-grupos — qué TIPOS lleva cada bloque.
 *
 * Brandon, 2026-09-02: *«solo en ese bloque quiero poner un tipo, en el
 * siguiente otros tipos»*. Antes se podían crear N bloques, pero el reparto le
 * daba a cada uno la misma tajada proporcional de todo lo pendiente: tres
 * bloques con la misma mezcla adentro no separan nada.
 *
 * Se eligen de una LISTA REAL —los grupos que de verdad hay pendientes en la
 * vista vigente—, no de un campo de texto: un tipo tipeado a mano que no
 * coincide con ninguno deja el bloque en cero sin decir por qué.
 *
 * ⛔ Es EXCLUYENTE (ver `gruposFiltro` en `cubicacion-reparto.ts`): lo que no
 * está elegido no entra ni aunque al bloque le sobre capacidad.
 */

import { useState } from "react";
import { Check, ChevronDown, X } from "@buleje/design-system/icons";

/** Un grupo elegible: su clave interna y el rótulo que ve el operario. */
export interface GrupoElegible {
  clave: string;
  label: string;
}

export function FiltroGruposCelda({
  valor, disponibles, dim, onChange,
}: {
  /** Claves YA con el prefijo de la dimensión (`dim|clave`). */
  valor: string[] | null | undefined;
  disponibles: GrupoElegible[];
  /** La dimensión vigente: con ella se arma la clave guardada. */
  dim: string;
  onChange: (next: string[] | null) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const prefijo = `${dim}|`;
  const elegidas = new Set((valor ?? []).filter((k) => k.startsWith(prefijo)).map((k) => k.slice(prefijo.length)));
  /**
   * Claves guardadas bajo OTRA vista. No se borran al tocar ésta —el operario
   * puede volver a esa agrupación y encontrarlas— pero tampoco cuentan acá.
   */
  const deOtrasVistas = (valor ?? []).filter((k) => !k.startsWith(prefijo));
  const elegidosLabels = disponibles.filter((g) => elegidas.has(g.clave)).map((g) => g.label);

  const alternar = (clave: string) => {
    const next = new Set(elegidas);
    if (next.has(clave)) next.delete(clave); else next.add(clave);
    const claves = [...next].map((c) => prefijo + c);
    const todo = [...deOtrasVistas, ...claves];
    onChange(claves.length > 0 ? todo : (deOtrasVistas.length > 0 ? deOtrasVistas : null));
  };

  const limpiar = () => onChange(deOtrasVistas.length > 0 ? deOtrasVistas : null);

  return (
    <div className="relative min-w-[170px]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Tipos que lleva este bloque"
        title={elegidosLabels.length > 0
          ? `Sólo: ${elegidosLabels.join(", ")}. Lo demás no entra a este bloque aunque le sobre capacidad.`
          : "Este bloque lleva de todo. Elegí uno o más tipos para que lleve sólo esos."}
        className={`inline-flex h-10 w-full items-center justify-between gap-1 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-sm font-bold outline-none focus:border-[var(--accent)] ${elegidosLabels.length > 0
          ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"}`}
      >
        <span className="truncate">
          {elegidosLabels.length === 0
            ? "de todo"
            : elegidosLabels.length === 1
              ? elegidosLabels[0]
              : `${elegidosLabels.length} tipos`}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>

      {abierto && (
        <>
          {/* Click afuera cierra: un desplegable de tabla que sólo se cierra
              con su propio botón se queda abierto tapando la fila de al lado. */}
          <button
            type="button"
            aria-label="Cerrar la lista de tipos"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-1 max-h-64 w-64 overflow-auto rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-2 shadow-lg">
            <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Este bloque lleva sólo…
            </p>
            {disponibles.length === 0 ? (
              <p className="px-1 py-2 text-xs text-[var(--text-tertiary)]">
                Todavía no hay nada cubicado para elegir.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {disponibles.map((g) => {
                  const marcado = elegidas.has(g.clave);
                  return (
                    <li key={g.clave}>
                      <button
                        type="button"
                        onClick={() => alternar(g.clave)}
                        aria-pressed={marcado}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors ${marcado
                          ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                      >
                        <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${marcado ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule-base)]"}`}>
                          {marcado && <Check className="h-3 w-3 text-white" aria-hidden />}
                        </span>
                        <span className="truncate">{g.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {elegidas.size > 0 && (
              <button
                type="button"
                onClick={() => { limpiar(); setAbierto(false); }}
                className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Que lleve de todo
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
