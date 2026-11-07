"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "@buleje/design-system/icons";
import type { PaginaEscaner } from "./tipos";

/**
 * Miniaturas en orden: tocar una la edita, arrastrar reordena (con ‹ › para
 * el dedo), la X la borra, «Agregar más» vuelve a las fuentes.
 */
export function TirasPaginas({
  paginas,
  onEditar,
  onQuitar,
  onReordenar,
  onAgregar,
}: {
  paginas: PaginaEscaner[];
  onEditar: (id: string) => void;
  onQuitar: (id: string) => void;
  onReordenar: (desde: number, hasta: number) => void;
  onAgregar: () => void;
}) {
  const desdeRef = useRef<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {paginas.map((p, i) => (
        <div
          key={p.id}
          draggable
          onDragStart={() => {
            desdeRef.current = i;
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(i);
          }}
          onDragEnd={() => {
            setSobre(null);
            desdeRef.current = null;
          }}
          onDrop={(e) => {
            e.preventDefault();
            const d = desdeRef.current;
            if (d !== null && d !== i) onReordenar(d, i);
            setSobre(null);
            desdeRef.current = null;
          }}
          className={`group relative overflow-hidden rounded-xl border-2 bg-[var(--surface-sunken)] ${
            sobre === i ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
          }`}
        >
          <button type="button" onClick={() => onEditar(p.id)} className="block aspect-[3/4] w-full" aria-label={`Editar página ${i + 1}`}>
            {p.miniaturaUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={p.miniaturaUrl} alt={`Página ${i + 1}`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">…</span>
            )}
          </button>
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[length:var(--ts-2xs,11px)] font-bold text-white">{i + 1}</span>
          <button
            type="button"
            onClick={() => onQuitar(p.id)}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
            aria-label={`Quitar página ${i + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 px-1 py-0.5">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => onReordenar(i, i - 1)}
              className="rounded p-0.5 text-white disabled:opacity-30"
              aria-label="Mover a la izquierda"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={i === paginas.length - 1}
              onClick={() => onReordenar(i, i + 1)}
              className="rounded p-0.5 text-white disabled:opacity-30"
              aria-label="Mover a la derecha"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAgregar}
        className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <Plus className="h-6 w-6" />
        <span className="text-xs font-semibold">Agregar más</span>
      </button>
    </div>
  );
}
