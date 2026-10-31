"use client";

import { useState, useRef } from "react";
import { Download, Eye, Upload, GitCompareArrows as GitCompare } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import CompararVersiones from "../CompararVersiones";
import { uploadVersion } from "@/hooks/use-documents";
import { type DbDocument, type DbDocumentVersion } from "@/lib/types/documents";
import { formatBytes, relativeTime } from "./formato";

export function VersionsTab({
  doc, docId, versions, reload, onRefresh,
}: { doc: DbDocument; docId: string; versions: DbDocumentVersion[]; reload: () => void; onRefresh?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  /** Muestra el diff de contenido (no sólo tamaño y fecha). */
  const [verDiff, setVerDiff] = useState(false);

  /**
   * La versión ACTUAL entra a la lista de comparables: la pregunta más común
   * es "¿qué cambió desde la v3 hasta lo que estoy viendo?", y el archivo
   * activo no vive en el historial (ese guarda las anteriores).
   */
  const actual: DbDocumentVersion = {
    id: "actual",
    documentId: docId,
    versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
    changeNote: "Versión actual",
    mimeType: doc.mimeType,
    size: doc.size,
    storagePath: doc.storagePath,
    uploadedById: doc.uploadedById,
    uploadedAt: doc.updatedAt || doc.uploadedAt,
  };
  const comparables = [actual, ...versions];
  const urlDe = (id: string) => id === "actual"
    ? `/api/admin/documents/${docId}/raw`
    : `/api/admin/documents/${docId}/versions/${id}/raw`;

  async function handleFile(f: File) {
    setUploading(true);
    try {
      await uploadVersion(docId, f, note.trim() || undefined);
      setNote("");
      await reload();
      onRefresh?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-2">Subir nueva versión</p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">Reemplaza el archivo activo y guarda la versión actual como histórico.</p>
        <input
          type="text"
          aria-label="Nota del cambio"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota del cambio (opcional)…"
          className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary mb-2"
        />
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {uploading ? "Subiendo…" : "Elegir archivo…"}
        </button>
      </div>

      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">Historial</p>
          {versions.length >= 1 && (
            <button
              onClick={() => { setCompareMode((c) => !c); setPicked([]); setVerDiff(false); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                compareMode ? "bg-primary text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" /> {compareMode ? "Salir" : "Comparar"}
            </button>
          )}
        </div>

        {compareMode && (
          <div className="border-b border-[var(--rule-base)] bg-primary/5 px-4 py-3">
            {picked.length < 2 ? (
              <p className="text-xs text-[var(--text-secondary)]">Elige <strong>2 versiones</strong> para comparar ({picked.length}/2).</p>
            ) : (() => {
              // Se busca en `comparables` (incluye la versión ACTUAL): buscar
              // sólo en el historial dejaba `b` en undefined y la ficha se caía
              // con "Algo salió mal" apenas se elegía la actual.
              const elegidas = picked
                .map((id) => comparables.find((v) => v.id === id))
                .filter((v): v is DbDocumentVersion => !!v)
                .sort((x, y) => x.versionNumber - y.versionNumber);
              if (elegidas.length < 2) {
                return <p className="text-xs text-[var(--text-secondary)]">Elige <strong>2 versiones</strong> para comparar.</p>;
              }
              const [a, b] = elegidas;
              const etiqueta = (v: DbDocumentVersion) => (v.id === "actual" ? "Actual" : `v${v.versionNumber}`);
              const delta = b.size - a.size;
              return (
                <div>
                  <p className="mb-2 text-sm font-bold text-primary">{etiqueta(a)} → {etiqueta(b)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[a, b].map((v) => (
                      <div key={v.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                        <p className="text-xs font-bold text-[var(--text-primary)]">{etiqueta(v)}</p>
                        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{v.changeNote ?? "Sin nota"}</p>
                        <p className="mt-0.5 text-[length:var(--ts-2xs,11px)] tabular-nums text-[var(--text-tertiary)]">{formatBytes(v.size)} · {relativeTime(v.uploadedAt)}</p>
                        <p className="truncate text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">por {v.uploadedById}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                    Tamaño: {delta === 0 ? "sin cambio" : `${delta > 0 ? "+" : "−"}${formatBytes(Math.abs(delta))}`}
                    {" · "}{b.versionNumber - a.versionNumber} versión(es) de diferencia
                  </p>

                  {/* El tamaño no dice QUÉ cambió: esto lo lee y lo lista. */}
                  {!verDiff ? (
                    <button
                      onClick={() => setVerDiff(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <GitCompare className="h-3.5 w-3.5" /> Ver qué cambió
                    </button>
                  ) : (
                    <div className="mt-3 border-t border-[var(--rule-base)] pt-3">
                      <CompararVersiones
                        urlAntes={urlDe(a.id)}
                        urlDespues={urlDe(b.id)}
                        etiquetaAntes={etiqueta(a)}
                        etiquetaDespues={etiqueta(b)}
                        mimeType={doc.mimeType}
                        nombre={doc.name}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {versions.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">Aún no hay versiones previas. Sube una nueva para crear la primera entrada.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {(compareMode ? comparables : versions).map((v) => {
              const isPicked = picked.includes(v.id);
              return (
                <li key={v.id} className={cn("px-4 py-3 flex items-center gap-3", compareMode && isPicked && "bg-primary/5")}>
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => { setVerDiff(false); setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id].slice(-2))); }}
                      className="h-4 w-4 shrink-0 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                      aria-label={`Comparar v${v.versionNumber}`}
                    />
                  )}
                  <span className="h-8 w-8 rounded-lg bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)] inline-flex items-center justify-center text-xs font-bold">v{v.versionNumber}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{v.changeNote ?? "Sin nota"}</p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{formatBytes(v.size)} · {relativeTime(v.uploadedAt)} · {v.uploadedById}</p>
                  </div>
                  {!compareMode && (
                    <div className="flex shrink-0 items-center gap-1">
                      <a href={`/api/admin/documents/${docId}/versions/${v.id}/raw`} target="_blank" rel="noopener" className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors" title="Ver esta versión" aria-label={`Ver v${v.versionNumber}`}><Eye className="h-4 w-4" /></a>
                      <a href={`/api/admin/documents/${docId}/versions/${v.id}/raw?download=1`} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors" title="Descargar esta versión" aria-label={`Descargar v${v.versionNumber}`}><Download className="h-4 w-4" /></a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────── Details tab (ADR-119) ───────────
