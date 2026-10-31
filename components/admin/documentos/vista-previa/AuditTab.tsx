"use client";

import { cn } from "@/lib/utils";
import { type DbDocumentAuditLog } from "@/lib/types/documents";
import { relativeTime } from "./formato";

export const ACTION_META: Record<string, { color: string; label: string }> = {
  upload: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Upload" },
  view: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Vista" },
  download: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Descarga" },
  rename: { color: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", label: "Renombrado" },
  delete: { color: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", label: "Eliminado" },
  restore: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Restaurado" },
  share: { color: "bg-[var(--accent)]/15 text-[var(--accent)]", label: "Compartido" },
  share_revoke: { color: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", label: "Share revocado" },
  sign: { color: "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", label: "Firmado" },
  version: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Nueva versión" },
  move: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Movido" },
  tag: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Tag" },
  whatsapp_send: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Enviado por WhatsApp" },
  read_text: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Texto leído" },
  codigo_fisico: { color: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", label: "Código en el físico" },
  ai_categorize: { color: "bg-[var(--accent)]/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", label: "Descrito con IA" },
  ai_expiry: { color: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", label: "Vencimiento leído" },
  ocr: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Escaneado (OCR)" },
  stamp: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Sellado" },
  link: { color: "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", label: "Vinculado" },
  merge: { color: "bg-[var(--accent)]/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", label: "Combinado" },
};

/** De qué renglón del papel salió la fecha que la lectura anotó sola. */
export const fragmentoDelVencimiento = (l: DbDocumentAuditLog) =>
  l.action === "ai_expiry" && typeof l.metadata?.fragmento === "string" ? l.metadata.fragmento : null;

export function AuditTab({ logs }: { logs: DbDocumentAuditLog[] }) {
  return (
    <div className="mx-auto max-w-4xl p-5">
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <p className="text-sm font-bold text-[var(--text-primary)] px-4 py-3 border-b border-[var(--rule-base)]">Registro de actividad</p>
        {logs.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">Sin eventos.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] ?? { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: l.action };
              return (
                <li key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-md shrink-0", meta.color)}>
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{l.actorId}</p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{relativeTime(l.createdAt)} · {l.ipAddress ?? "—"}</p>
                    {fragmentoDelVencimiento(l) && (
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">Leído de «{fragmentoDelVencimiento(l)}»</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}