"use client";

import { Tag, FolderArchive, X } from "@buleje/design-system/icons";
import type { ModeloArchivo } from "./use-archivo";
import { precargarArchivo } from "./perezosos";
export default function CartelEtiqueta({ arch }: { arch: ModeloArchivo }) {
  const { etiquetaFiltro, loading, displayDocs, setExpediente, setEtiquetaFiltro } = arch;
  return (
    <>
      {/* Cartel del filtro por etiqueta (Archivo-hub, ADR-502): «ver todo de
          esta entidad». Mientras está activo se muestra la lista plana de los
          documentos con ese tag (cruza carpetas) y el panel/árbol de carpetas
          queda oculto; «Quitar» vuelve al drive normal. */}
      {etiquetaFiltro && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3">
          <Tag className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <p className="min-w-0 text-sm font-semibold text-[var(--text-primary)]">
            Mostrando los documentos de:{" "}
            <span className="font-bold text-[var(--accent)]">{etiquetaFiltro.label}</span>
          </p>
          <span className="shrink-0 text-sm tabular-nums text-[var(--text-tertiary)]">
            {loading ? "…" : `${displayDocs.length} ${displayDocs.length === 1 ? "documento" : "documentos"}`}
          </span>
          {/* Todo lo de esta etiqueta en un PDF (fuente `tag`: cruza carpetas).
              Los dos botones van juntos: a 400 px bajan en una sola fila. */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!loading && displayDocs.length > 0 && (
              <button
                type="button"
                onPointerEnter={() => precargarArchivo("expediente")}
                onFocus={() => precargarArchivo("expediente")}
                onClick={() => setExpediente({ tipo: "tag", tag: etiquetaFiltro.tag, nombre: etiquetaFiltro.label })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                title="Un solo PDF con portada, índice y estos papeles en orden"
              >
                <FolderArchive className="h-3.5 w-3.5" aria-hidden /> Armar expediente
              </button>
            )}
            <button
              type="button"
              onClick={() => setEtiquetaFiltro(null)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <X className="h-3.5 w-3.5" /> Quitar
            </button>
          </div>
        </div>
      )}
    </>
  );
}