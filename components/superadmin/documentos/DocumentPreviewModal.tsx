"use client";

import { useEffect, useState } from "react";
import { X, Loader2, FileText, Download, Eye } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { fmtBytes } from "./shared";
import { csrfHeaders } from "@/lib/csrf-client";

interface Props {
  doc: DbDocument;
  onClose: () => void;
}

export default function DocumentPreviewModal({ doc, onClose }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/superadmin/documents/${doc.id}`, {
          headers: csrfHeaders({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { signedUrl?: string };
        if (!cancelled) {
          if (data.signedUrl) {
            setSignedUrl(data.signedUrl);
          } else {
            setError(true);
          }
        }
      } catch (err) {
        console.error("[sa-preview] failed to fetch signedUrl", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  const handleDownload = () => {
    if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
  };

  function renderBody() {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
        </div>
      );
    }

    if (error || !signedUrl) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
          <p className="text-base font-semibold text-[var(--data-error-500)]">
            No se pudo cargar la vista previa.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]"
          >
            Cerrar
          </button>
        </div>
      );
    }

    if (doc.mimeType.startsWith("image/")) {
      return (
        <div className="flex flex-1 items-center justify-center overflow-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt={doc.name}
            className="max-h-[75vh] max-w-full mx-auto object-contain rounded-xl"
          />
        </div>
      );
    }

    if (doc.mimeType === "application/pdf") {
      return (
        <div className="flex flex-1 p-4">
          <iframe
            src={signedUrl}
            className="w-full h-[75vh] rounded-xl border-2 border-[var(--rule-base)]"
            title={doc.name}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <FileText className="h-14 w-14 text-[var(--text-tertiary)]" />
        <p className="text-base text-[var(--text-secondary)]">
          Este tipo de archivo no tiene vista previa.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          aria-label="Descargar documento"
          className="flex items-center gap-2 h-10 px-5 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Descargar
        </button>
      </div>
    );
  }

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
        aria-label={`Vista previa: ${doc.name}`}
        className="flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-[var(--rule-base)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="text-base font-extrabold text-[var(--text-primary)] truncate">
              {doc.name}
            </span>
            <span className="text-sm text-[var(--text-tertiary)] shrink-0">
              {fmtBytes(doc.size)}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {signedUrl && (
              <button
                type="button"
                onClick={handleDownload}
                aria-label="Descargar documento"
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border-2 border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]"
              >
                <Download className="h-4 w-4" />
                Descargar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-auto">{renderBody()}</div>
      </div>
    </div>
  );
}
