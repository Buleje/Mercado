"use client";

/**
 * La franja «Viendo solo <permiso> · Ver todos» del libro.
 *
 * Brandon 08-10: con un permiso elegido el libro está FILTRADO y eso tiene que
 * leerse de lejos, no sólo en el chip de la banda. El chip (que vive dentro de
 * `LibroChrome` como `contrato`) publica su texto con `usePublicarFranjaLibro`
 * y el chrome lo dibuja debajo de la banda. Va por contexto y no por prop para
 * que ningún libro tenga que cablear nada: `shared` sigue sin importar de
 * `forestal`.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Filter } from "@buleje/design-system/icons";

export interface FranjaLibro {
  /** Lo que se está viendo, sin el «Viendo solo»: «el permiso PO 12 · COMUNIDAD…». */
  texto: string;
  onQuitar: () => void;
}

export const FranjaLibroContext = createContext<((f: FranjaLibro | null) => void) | null>(null);

/**
 * Publica (o retira, con `texto = null`) la franja del libro que contiene a
 * quien lo llama. `onQuitar` va por ref: cambia en cada render y no debe
 * volver a publicar.
 */
export function usePublicarFranjaLibro(texto: string | null, onQuitar: () => void) {
  const publicar = useContext(FranjaLibroContext);
  const quitar = useRef(onQuitar);
  useEffect(() => {
    quitar.current = onQuitar;
  });
  useEffect(() => {
    if (!publicar || !texto) return;
    publicar({ texto, onQuitar: () => quitar.current() });
    return () => publicar(null);
  }, [publicar, texto]);
}

export function FranjaDelLibro({ franja }: { franja: FranjaLibro | null }): ReactNode {
  if (!franja) return null;
  return (
    <div
      role="status"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)] print:hidden"
    >
      <Filter className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" aria-hidden="true" />
      <span className="min-w-0 truncate">
        Viendo solo <b className="font-bold">{franja.texto}</b>
      </span>
      <span aria-hidden="true" className="text-[var(--text-tertiary)]">
        ·
      </span>
      <button
        type="button"
        onClick={franja.onQuitar}
        className="shrink-0 font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        Ver todos
      </button>
    </div>
  );
}
