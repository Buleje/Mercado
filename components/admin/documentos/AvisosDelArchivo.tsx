"use client";

/**
 * La lista de sugerencias de la IA del Archivo: cada papel con «mover a X» y
 * «vence el …», su ✓ para aplicarla y su ✕ para descartarla. Se abre desde el
 * aviso «N por ordenar» de la cabecera de Documentos (31-10: los avisos
 * subieron a la fila de las pestañas; antes eran una fila propia con sus
 * pastillas — ver `archivo/use-avisos-archivo.ts`).
 */

import { Check, X } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";

export interface SugerenciaIA {
  doc: DbDocument;
  carpeta: { folderId: string; folderName: string } | null;
  vence: string | null;
}

export default function ListaSugerenciasIA({ sugerencias, onAplicar, onDescartar, fechaCorta }: {
  sugerencias: readonly SugerenciaIA[];
  onAplicar: (docId: string, cambios: { folderId?: string; expiresAt?: string }) => void;
  onDescartar: (docId: string) => void;
  /** «15/01/2027» */
  fechaCorta: (iso: string) => string;
}) {
  if (sugerencias.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-raised)]">
      {sugerencias.map(({ doc, carpeta, vence }) => (
        <li key={doc.id} className="flex items-center gap-2 pl-3">
          <div className="min-w-0 flex-1 py-1.5">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]" title={doc.name}>{doc.name}</span>
            <span className="block text-sm text-[var(--text-secondary)]">
              {carpeta && <>mover a <b className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{carpeta.folderName}</b></>}
              {carpeta && vence && " · "}
              {vence && <>vence el <b className="text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{fechaCorta(vence)}</b></>}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onAplicar(doc.id, {
              ...(carpeta ? { folderId: carpeta.folderId } : {}),
              ...(vence ? { expiresAt: vence } : {}),
            })}
            title="Aplicar la sugerencia"
            aria-label={`Aplicar la sugerencia para ${doc.name}`}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
          >
            <Check className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDescartar(doc.id)}
            aria-label={`Descartar sugerencia para ${doc.name}`}
            title="Descartar"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
