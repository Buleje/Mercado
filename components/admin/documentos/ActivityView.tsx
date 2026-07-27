"use client";

import { useEffect, useState } from "react";
import {
  Upload, Eye, Download, Pencil, Trash2, RotateCcw, Share2, Ban, PenTool, FileText, FolderInput, Tag, History, Loader2, User, Sparkles, ScanLine, Stamp, Link2, Combine, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DbDocumentActivity, DocAction } from "@/lib/types/documents";
import { fetchRecentActivity } from "@/hooks/use-documents";

// Verbo + ícono + tint por acción. Los tints usan tokens --data-* con dark.
const ACTION_META: Record<DocAction, { verb: string; Icon: typeof Upload; cls: string }> = {
  upload: { verb: "subió", Icon: Upload, cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  view: { verb: "vio", Icon: Eye, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  download: { verb: "descargó", Icon: Download, cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  rename: { verb: "renombró", Icon: Pencil, cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  delete: { verb: "eliminó", Icon: Trash2, cls: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" },
  restore: { verb: "restauró", Icon: RotateCcw, cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  share: { verb: "compartió", Icon: Share2, cls: "bg-[var(--accent)]/15 text-[var(--accent)]" },
  share_revoke: { verb: "revocó el link de", Icon: Ban, cls: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" },
  sign: { verb: "firmó", Icon: PenTool, cls: "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  version: { verb: "subió una versión de", Icon: FileText, cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  move: { verb: "movió", Icon: FolderInput, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  tag: { verb: "etiquetó", Icon: Tag, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  whatsapp_send: { verb: "mandó por WhatsApp", Icon: MessageCircle, cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  ai_categorize: { verb: "clasificó con IA", Icon: Sparkles, cls: "bg-[var(--accent)]/15 text-[var(--accent)]" },
  ocr: { verb: "escaneó (OCR)", Icon: ScanLine, cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  stamp: { verb: "selló", Icon: Stamp, cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  link: { verb: "vinculó", Icon: Link2, cls: "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  merge: { verb: "combinó", Icon: Combine, cls: "bg-[var(--accent)]/15 text-[var(--accent)]" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/** Feed de actividad reciente del drive (cross-documento). */
export function ActivityView() {
  const [activity, setActivity] = useState<DbDocumentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchRecentActivity(60)
      .then(setActivity)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-white p-10 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando actividad…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
        No se pudo cargar la actividad: {error}
        <button onClick={load} className="ml-2 underline">Reintentar</button>
      </div>
    );
  }
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white p-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><History className="h-7 w-7" /></div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">Sin actividad todavía</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Cuando subas, muevas, firmes o compartas documentos, vas a ver acá el registro de quién hizo qué y cuándo.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]"><History className="h-3.5 w-3.5" /> Actividad reciente del drive</p>
        <button onClick={load} className="text-xs font-bold text-[var(--text-tertiary)] hover:text-primary">Actualizar</button>
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {activity.map((a) => {
          const meta = ACTION_META[a.action] ?? ACTION_META.view;
          return (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.cls)}>
                <meta.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text-primary)]">
                  <span className="inline-flex items-center gap-1 font-bold"><User className="h-3 w-3 text-[var(--text-tertiary)]" />{a.actorId}</span>
                  <span className="text-[var(--text-secondary)]"> {meta.verb} </span>
                  <span className={cn("font-bold", a.documentDeleted && "text-[var(--text-tertiary)] line-through")}>{a.documentName}</span>
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]">{relativeTime(a.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
