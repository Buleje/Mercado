"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Upload, FileText, X, Loader2, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocument, DbDocumentVersion } from "@/lib/types/documents";
import { fmtBytes, fmtDate } from "./shared";

interface Props {
  doc: DbDocument;
  onClose: () => void;
  onChanged?: () => void;
}

const API_BASE = "/api/superadmin/documents";

const FIELD =
  "w-full h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)]";

export default function DocumentVersionsModal({ doc, onClose, onChanged }: Props) {
  const [versions, setVersions] = useState<DbDocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/${doc.id}/versions`, {
        headers: csrfHeaders({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { versions: DbDocumentVersion[] };
      const sorted = [...(data.versions ?? [])].sort(
        (a, b) => b.versionNumber - a.versionNumber,
      );
      setVersions(sorted);
    } catch (err) {
      console.error("[sa-versions] load failed", err);
      setError("No se pudieron cargar las versiones.");
    } finally {
      setLoading(false);
    }
  }, [doc.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxVersion =
    versions.length > 0 ? Math.max(...versions.map((v) => v.versionNumber)) : -1;

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (changeNote.trim()) fd.append("changeNote", changeNote.trim());
      const res = await fetch(`${API_BASE}/${doc.id}/versions`, {
        method: "POST",
        headers: csrfHeaders({}),
        body: fd,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setFile(null);
      setChangeNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadVersions();
      onChanged?.();
    } catch (err) {
      console.error("[sa-versions] upload failed", err);
      setUploadError(
        err instanceof Error ? err.message : "No se pudo subir la versión.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historial de versiones"
        className="flex w-full max-w-lg flex-col rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)] max-h-[90vh] gap-4"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[var(--text-secondary)]" />
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Historial de versiones
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Doc name + explanation */}
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium">{doc.name}</span>
          </div>
          <p className="rounded-xl border border-[var(--rule-base)] bg-primary/10 px-3 py-2 text-xs text-[var(--text-tertiary)]">
            El archivo actual es la versión vigente. Subir una versión nueva la reemplaza y
            archiva la anterior.
          </p>
        </div>

        {/* Version list */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-[var(--data-error-500)]">{error}</p>
          ) : versions.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
              Sin versiones registradas.
            </p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                  v.versionNumber === maxVersion
                    ? "border-[var(--rule-base)] bg-primary/10"
                    : "border-[var(--rule-base)] bg-transparent",
                )}
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">
                      v{v.versionNumber}
                    </span>
                    {v.versionNumber === maxVersion && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                        vigente
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {fmtBytes(v.size)}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {fmtDate(v.uploadedAt)}
                    </span>
                  </div>
                  {v.changeNote && (
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {v.changeNote}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upload form */}
        <div className="shrink-0 space-y-3 border-t-2 border-[var(--rule-base)] pt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
            <Upload className="h-4 w-4" />
            Subir nueva versión
          </p>

          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={FIELD}
          />

          <input
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Nota del cambio (opcional)"
            className={FIELD}
          />

          {uploadError && (
            <p className="text-xs text-[var(--data-error-500)]">{uploadError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              aria-label="Subir nueva versión del documento"
              className="flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading && <Loader2 className="h-5 w-5 animate-spin" />}
              Subir versión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
