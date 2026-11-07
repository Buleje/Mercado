"use client";

import { FolderInput, FolderOpen, X } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { cn } from "@/lib/utils";
import type { PropuestaCarpetaModelo } from "./use-propuesta-carpeta";

/**
 * «¿Va a "CCNN Santa Rosa de Chivis"? · Mover · Otra · No» (Brandon 24-10).
 * El aviso «N por ubicar» va en la cabecera de Documentos (31-10, con Mover,
 * Otra carpeta y No en el menú «Avisos»); al tocarlo se abre debajo esta lista
 * con todas las candidatas de cada papel suelto. Nada se mueve solo.
 */

const ACENTO = "text-[var(--accent-ink)] dark:text-[var(--accent)]";

interface ListaProps {
  modelo: PropuestaCarpetaModelo;
  /** «Otra carpeta…»: la ventana de mover de siempre, con todo el árbol. */
  onOtraCarpeta: (doc: DbDocument) => void;
}

export function ListaPropuestas({ modelo, onOtraCarpeta }: ListaProps) {
  const { items, moviendo, mover, descartar } = modelo;
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-raised)]">
      {items.map(({ doc, candidatas }) => (
        <li key={doc.id} className="flex flex-wrap items-center gap-2 py-1.5 pl-3">
          <div className="min-w-0 flex-1 basis-48">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]" title={doc.name}>{doc.name}</span>
            <span className="block truncate text-sm text-[var(--text-secondary)]">{candidatas[0].motivos.join(" · ")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pr-1">
            {candidatas.map((c) => (
              <button
                key={c.folderId}
                type="button"
                onClick={() => void mover(doc, c.folderId)}
                disabled={moviendo === doc.id}
                title={c.motivos.join(" · ")}
                className={cn(
                  "inline-flex h-12 max-w-64 items-center gap-1.5 rounded-xl max-sm:max-w-full border border-[var(--accent)]/40 px-3 text-sm font-bold transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60",
                  ACENTO,
                )}
              >
                <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{c.nombre}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onOtraCarpeta(doc)}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden /> Otra carpeta…
            </button>
            <button
              type="button"
              onClick={() => descartar(doc.id)}
              aria-label={`No proponer carpeta para ${doc.name}`}
              title="No va en ninguna de estas"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
