"use client";

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
import { DOC_CATEGORIES } from "@/lib/types/documents";
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
  onChangeCategory: (doc: DbDocument, category: string) => void;
  onPreview: (doc: DbDocument) => void;
  onEdit: (doc: DbDocument) => void;
  onShare: (doc: DbDocument) => void;
  onVersions: (doc: DbDocument) => void;
  onActivity: (doc: DbDocument) => void;
  onSign: (doc: DbDocument) => void;
  onDownload: (doc: DbDocument) => void;
  onRemove: (doc: DbDocument) => void;
}

export default function DocumentRow({
  doc,
  busy,
  selecting,
  selected,
  onToggleSelect,
  onToggleFavorite,
  onChangeCategory,
  onPreview,
  onEdit,
  onShare,
  onVersions,
  onActivity,
  onSign,
  onDownload,
  onRemove,
}: Props) {
  const dd = daysUntil(doc.expiresAt);
  const expWarn = dd !== null && dd <= EXPIRY_WARN_DAYS;
  const expired = dd !== null && dd < 0;
  const FileGlyph = isImage(doc.mimeType) ? ImageIcon : FileText;

  return (
    <li
      className={cn(
        "flex items-center gap-3 p-4 transition-colors",
        selected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-alt)]/50",
      )}
    >
      {selecting && (
        <button
          type="button"
          onClick={() => onToggleSelect(doc.id)}
          aria-pressed={selected}
          aria-label={selected ? "Quitar de la selección" : "Seleccionar"}
          className="shrink-0 text-[var(--text-tertiary)] hover:text-primary"
        >
          {selected ? (
            <CheckSquare className="h-5 w-5 text-primary" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>
      )}

      <FileGlyph className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-[var(--text-primary)] truncate">{doc.name}</p>
        <p className="text-sm text-[var(--text-tertiary)] flex flex-wrap items-center gap-x-1">
          <span>
            {fmtBytes(doc.size)} · subido {fmtDate(doc.uploadedAt)}
          </span>
          {doc.expiresAt && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                expired
                  ? "text-[var(--data-error-500)]"
                  : expWarn
                    ? "text-[var(--data-warning-500)]"
                    : "text-[var(--text-secondary)]",
              )}
            >
              · <Clock className="h-3.5 w-3.5" />
              {expired ? "venció" : "vence"} {fmtDate(doc.expiresAt)}
            </span>
          )}
        </p>
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {doc.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              >
                {t}
              </span>
            ))}
            {doc.tags.length > 4 && (
              <span className="text-xs text-[var(--text-tertiary)]">+{doc.tags.length - 4}</span>
            )}
          </div>
        )}
      </div>

      <select
        value={doc.category}
        onChange={(e) => onChangeCategory(doc, e.target.value)}
        aria-label="Categoría"
        className="hidden md:block text-sm border-2 border-[var(--rule-base)] rounded-xl px-2 h-9 bg-[var(--surface-raised)] text-[var(--text-secondary)]"
      >
        {DOC_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CAT_LABEL[c] ?? c}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => onToggleFavorite(doc)}
        title="Favorito"
        aria-label={doc.favorite ? "Quitar de favoritos" : "Marcar favorito"}
        className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]"
      >
        <Star
          className={cn(
            "h-5 w-5",
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
        className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-primary hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      </button>
      <DocumentActionsMenu
        doc={doc}
        busy={busy}
        size="md"
        onPreview={onPreview}
        onEdit={onEdit}
        onShare={onShare}
        onVersions={onVersions}
        onActivity={onActivity}
        onSign={onSign}
        onRemove={onRemove}
      />
    </li>
  );
}
