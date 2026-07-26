"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  ImageIcon,
  Star,
  Download,
  Clock,
  Loader2,
  CheckSquare,
  Square,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocument } from "@/lib/types/documents";
import { CAT_LABEL, EXPIRY_WARN_DAYS, daysUntil, fmtBytes, fmtDate, isImage } from "./shared";
import DocumentActionsMenu from "./DocumentActionsMenu";

interface Props {
  doc: DbDocument;
  busy: boolean;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (doc: DbDocument) => void;
  onPreview: (doc: DbDocument) => void;
  onEdit: (doc: DbDocument) => void;
  onShare: (doc: DbDocument) => void;
  onVersions: (doc: DbDocument) => void;
  onActivity: (doc: DbDocument) => void;
  onSign: (doc: DbDocument) => void;
  onDownload: (doc: DbDocument) => void;
  onRemove: (doc: DbDocument) => void;
}

/** Miniatura lazy para imágenes (preview=1 NO cuenta como "view" en el audit). */
function useImagePreview(doc: DbDocument): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage(doc.mimeType)) return;
    let active = true;
    fetch(`/api/superadmin/documents/${doc.id}?preview=1`, { headers: csrfHeaders({}) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { signedUrl?: string } | null) => {
        if (active && d?.signedUrl) setUrl(d.signedUrl);
      })
      .catch((err) => console.error("[sa-documents] preview failed", err));
    return () => {
      active = false;
    };
  }, [doc.id, doc.mimeType]);
  return url;
}

export default function DocumentCard({
  doc,
  busy,
  selecting,
  selected,
  onToggleSelect,
  onToggleFavorite,
  onPreview,
  onEdit,
  onShare,
  onVersions,
  onActivity,
  onSign,
  onDownload,
  onRemove,
}: Props) {
  const preview = useImagePreview(doc);
  const dd = daysUntil(doc.expiresAt);
  const expWarn = dd !== null && dd <= EXPIRY_WARN_DAYS;
  const expired = dd !== null && dd < 0;
  const FileGlyph = isImage(doc.mimeType) ? ImageIcon : FileText;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border-2 overflow-hidden bg-[var(--surface-raised)] transition-colors",
        selected ? "border-primary" : "border-[var(--rule-base)] hover:border-[var(--text-tertiary)]",
      )}
    >
      {/* Thumbnail */}
      <button
        type="button"
        onClick={() => (selecting ? onToggleSelect(doc.id) : onPreview(doc))}
        className="relative h-32 w-full flex items-center justify-center bg-[var(--surface-sunken)] overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={doc.name} className="h-full w-full object-cover" />
        ) : (
          <FileGlyph className="h-10 w-10 text-[var(--text-tertiary)]" />
        )}
        {doc.favorite && (
          <Star className="absolute top-2 right-2 h-5 w-5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
        )}
      </button>

      {selecting && (
        <button
          type="button"
          onClick={() => onToggleSelect(doc.id)}
          aria-pressed={selected}
          aria-label={selected ? "Quitar de la selección" : "Seleccionar"}
          className="absolute top-2 left-2 rounded-md bg-[var(--surface-raised)]/90 p-0.5"
        >
          {selected ? (
            <CheckSquare className="h-5 w-5 text-primary" />
          ) : (
            <Square className="h-5 w-5 text-[var(--text-tertiary)]" />
          )}
        </button>
      )}

      {/* Body */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate" title={doc.name}>
          {doc.name}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {fmtBytes(doc.size)} · {CAT_LABEL[doc.category] ?? doc.category}
        </p>
        {doc.expiresAt && (
          <p
            className={cn(
              "text-xs inline-flex items-center gap-0.5 font-semibold",
              expired
                ? "text-[var(--data-error-500)]"
                : expWarn
                  ? "text-[var(--data-warning-500)]"
                  : "text-[var(--text-secondary)]",
            )}
          >
            <Clock className="h-3 w-3" /> {expired ? "venció" : "vence"} {fmtDate(doc.expiresAt)}
          </p>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-1 mt-auto pt-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(doc)}
            title="Favorito"
            aria-label={doc.favorite ? "Quitar de favoritos" : "Marcar favorito"}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]"
          >
            <Star
              className={cn(
                "h-4 w-4",
                doc.favorite
                  ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                  : "text-[var(--text-tertiary)]",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => onDownload(doc)}
            disabled={busy}
            title="Descargar"
            aria-label="Descargar documento"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          <div className="ml-auto">
            <DocumentActionsMenu
              doc={doc}
              busy={busy}
              size="sm"
              onPreview={onPreview}
              onEdit={onEdit}
              onShare={onShare}
              onVersions={onVersions}
              onActivity={onActivity}
              onSign={onSign}
              onRemove={onRemove}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
