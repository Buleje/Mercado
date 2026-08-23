"use client";

import { useEffect, useState } from "react";
import { X, RotateCw, Trash2, ChevronLeft, ChevronRight, Loader2, Save, FileText } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { fetchPageCount, editPages } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";

/**
 * Editor de páginas de un PDF: reordena (‹ ›), elimina y rota páginas
 * individuales sobre sus miniaturas (endpoint /thumbnail?page=N). Al guardar
 * reconstruye el PDF como una nueva versión.
 */
type Page = { origIndex: number; rotate: number };

export function PageEditorModal({ doc, onClose, onDone }: { doc: DbDocument; onClose: () => void; onDone: () => void }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPageCount(doc.id)
      .then((n) => { if (alive) { setPages(Array.from({ length: n }, (_, i) => ({ origIndex: i, rotate: 0 }))); setLoading(false); } })
      .catch(() => { if (alive) { setError("No se pudieron leer las páginas."); setLoading(false); } });
    return () => { alive = false; };
  }, [doc.id]);

  const rotate = (i: number) => setPages((p) => p.map((pg, idx) => (idx === i ? { ...pg, rotate: (pg.rotate + 90) % 360 } : pg)));
  const remove = (i: number) => setPages((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setPages((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const next = [...p];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const save = async () => {
    if (pages.length === 0) { setError("Dejá al menos una página."); return; }
    setBusy(true);
    setError(null);
    try {
      await editPages(doc.id, pages.map((p) => ({ index: p.origIndex, rotate: p.rotate })));
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[46rem] flex-col overflow-hidden rounded-2xl bg-white dark:bg-[var(--color-card)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] p-4">
          <CardTitle as="h3" className="inline-flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"><FileText className="h-5 w-5 text-primary" /> Editar páginas</CardTitle>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-xs text-[var(--text-secondary)]">Reordená con ‹ ›, rotá o eliminá páginas. Se guarda como una nueva versión de <span className="font-semibold">{doc.name}</span>.</p>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando páginas…</div>
          ) : pages.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">No quedan páginas. Agregá al menos una o cancelá.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pages.map((pg, i) => (
                <div key={`${pg.origIndex}-${i}`} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                  <div className="relative aspect-[3/4] overflow-hidden bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/admin/documents/${doc.id}/thumbnail?page=${pg.origIndex + 1}`}
                      alt={`Página ${pg.origIndex + 1}`}
                      loading="lazy"
                      className="h-full w-full object-contain transition-transform"
                      style={{ transform: `rotate(${pg.rotate}deg)` }}
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[length:var(--ts-2xs,11px)] font-bold text-white tabular-nums">{i + 1}</span>
                  </div>
                  <div className="flex items-center justify-between gap-0.5 p-1.5">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-primary disabled:opacity-30" aria-label="Mover izquierda"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => rotate(i)} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-primary" aria-label="Rotar"><RotateCw className="h-4 w-4" /></button>
                    <button onClick={() => remove(i)} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--data-error-700)]" aria-label="Eliminar página"><Trash2 className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === pages.length - 1} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-primary disabled:opacity-30" aria-label="Mover derecha"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-3 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--rule-base)] p-4">
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">{pages.length} página(s)</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button onClick={save} disabled={busy || loading || pages.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
