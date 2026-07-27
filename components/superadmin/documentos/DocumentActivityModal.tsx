"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  X,
  Loader2,
  Upload,
  Eye,
  Download,
  Pencil,
  Trash2,
  RotateCcw,
  Share2,
  History,
  FolderOpen,
  Tag,
  FileText,
  Sparkles,
  PenTool,
  Stamp,
  Link2,
  Combine,
  MessageCircle,
} from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentAuditLog, DocAction } from "@/lib/types/documents";
import { fmtDate } from "./shared";
import { csrfHeaders } from "@/lib/csrf-client";

// ── types ────────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

interface ActionMeta {
  label: string;
  Icon: IconComponent;
  color: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fmtDate(iso);
  }
}

function renderMetaExtras(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  if (meta.versionNumber != null) parts.push(`v${meta.versionNumber}`);
  if (meta.newName != null) parts.push(`→ "${meta.newName}"`);
  if (meta.targetFolder != null) parts.push(`→ ${String(meta.targetFolder)}`);
  if (meta.token != null) parts.push(`token: ${String(meta.token).slice(0, 8)}…`);
  return parts.length ? parts.join(" · ") : null;
}

// ── acción → label + icono ────────────────────────────────────────────────────

const ACTION_META: Record<DocAction, ActionMeta> = {
  upload:        { label: "Subido",          Icon: Upload,    color: "var(--data-success-500)" },
  view:          { label: "Visto",           Icon: Eye,       color: "var(--text-tertiary)" },
  download:      { label: "Descargado",      Icon: Download,  color: "var(--data-info-500)" },
  rename:        { label: "Renombrado",      Icon: Pencil,    color: "var(--text-secondary)" },
  delete:        { label: "Borrado",         Icon: Trash2,    color: "var(--data-error-500)" },
  restore:       { label: "Restaurado",      Icon: RotateCcw, color: "var(--data-success-500)" },
  share:         { label: "Compartido",      Icon: Share2,    color: "var(--data-info-500)" },
  share_revoke:  { label: "Link revocado",   Icon: Trash2,    color: "var(--data-warning-500)" },
  sign:          { label: "Firmado",         Icon: PenTool,   color: "var(--data-success-500)" },
  version:       { label: "Nueva versión",   Icon: History,   color: "var(--data-info-500)" },
  move:          { label: "Movido",          Icon: FolderOpen, color: "var(--text-secondary)" },
  tag:           { label: "Etiquetado",      Icon: Tag,       color: "var(--accent)" },
  ocr:           { label: "OCR",             Icon: FileText,  color: "var(--text-tertiary)" },
  ai_categorize: { label: "Categorizado IA", Icon: Sparkles,  color: "var(--data-info-500)" },
  stamp:         { label: "Sellado",         Icon: Stamp,     color: "var(--data-success-500)" },
  link:          { label: "Vinculado",       Icon: Link2,     color: "var(--data-info-500)" },
  merge:         { label: "Combinado",       Icon: Combine,   color: "var(--accent)" },
  whatsapp_send: { label: "Enviado por WhatsApp", Icon: MessageCircle, color: "var(--data-success-500)" },
};

function getMeta(action: DocAction): ActionMeta {
  return ACTION_META[action] ?? { label: action, Icon: FileText, color: "var(--text-tertiary)" };
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  doc: DbDocument;
  onClose: () => void;
}

export default function DocumentActivityModal({ doc, onClose }: Props) {
  const [logs, setLogs] = useState<DbDocumentAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/superadmin/documents/${doc.id}/audit`, {
      headers: csrfHeaders({}),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { logs: DbDocumentAuditLog[] };
        if (!cancelled) setLogs(data.logs ?? []);
      })
      .catch((err: unknown) => {
        console.error("[sa-activity] error cargando audit log del documento", err);
        if (!cancelled) setError("No se pudo cargar el registro de actividad.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Registro de actividad"
        className="w-full max-w-lg rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-lg)] flex flex-col"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Registro de actividad
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5 max-w-xs">
              {doc.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-3 p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-[var(--rule-soft)] mx-5" />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 max-h-[70vh]">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-[var(--text-tertiary)]">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">Cargando actividad…</span>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-500)]">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="h-9 w-9 text-[var(--text-tertiary)]" />
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Sin actividad registrada todavía.
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Las acciones sobre este documento aparecerán aquí.
              </p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <ol className="relative border-l-2 border-[var(--rule-soft)] ml-2 space-y-0">
              {logs.map((log) => {
                const { label, Icon, color } = getMeta(log.action);
                const extras = renderMetaExtras(log.metadata);
                return (
                  <li key={log.id} className="pl-6 pb-5 relative">
                    {/* Timeline dot */}
                    <span
                      className="absolute -left-[11px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)]"
                      aria-hidden="true"
                    >
                      <Icon className="h-3 w-3" style={{ color }} />
                    </span>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color }}>
                          {label}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {fmtDateTime(log.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--text-secondary)]">
                        Actor:{" "}
                        <span className="font-mono text-[var(--text-primary)]">
                          {log.actorId}
                        </span>
                      </p>

                      {log.ipAddress && (
                        <p className="text-xs text-[var(--text-tertiary)]">
                          IP:{" "}
                          <span className="font-mono">{log.ipAddress}</span>
                        </p>
                      )}

                      {extras && (
                        <p className="text-xs italic text-[var(--text-tertiary)]">
                          {extras}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Footer counter */}
        {!loading && !error && logs.length > 0 && (
          <>
            <div className="border-t border-[var(--rule-soft)] mx-5" />
            <div className="px-5 py-3 shrink-0">
              <span className="text-xs text-[var(--text-tertiary)]">
                {logs.length} evento{logs.length !== 1 ? "s" : ""} · más reciente arriba
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
