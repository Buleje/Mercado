"use client";

import { FileText, ImageIcon, RotateCcw, Trash2, Loader2 } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { fmtBytes, fmtDate, isImage } from "./shared";

interface Props {
  docs: DbDocument[];
  loading: boolean;
  busyId: string | null;
  onRestore: (doc: DbDocument) => void;
  onPurge: (doc: DbDocument) => void;
}

/** Vista de la papelera: documentos soft-deleted con restaurar / borrar definitivo. */
export default function DocumentTrashView({ docs, loading, busyId, onRestore, onPurge }: Props) {
  if (loading) {
    return (
      <div className="p-10 text-center bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="p-10 text-center bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl">
        <Trash2 className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-2" />
        <p className="text-base font-semibold text-[var(--text-secondary)]">La papelera está vacía.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <ul className="divide-y divide-[var(--rule-soft)]">
        {docs.map((d) => {
          const FileGlyph = isImage(d.mimeType) ? ImageIcon : FileText;
          const busy = busyId === d.id;
          return (
            <li key={d.id} className="flex items-center gap-3 p-4">
              <FileGlyph className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-[var(--text-primary)] truncate">{d.name}</p>
                <p className="text-sm text-[var(--text-tertiary)]">
                  {fmtBytes(d.size)} · borrado {fmtDate(d.deletedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRestore(d)}
                disabled={busy}
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Restaurar
              </button>
              <button
                type="button"
                onClick={() => onPurge(d)}
                disabled={busy}
                aria-label="Borrar definitivamente"
                title="Borrar definitivamente"
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Definitivo</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
