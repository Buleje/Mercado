"use client";

import { useState } from "react";
import { X, Shield, Check, Pencil as PencilLine } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { docApproval } from "@/hooks/use-documents";
import { type DbDocument } from "@/lib/types/documents";
import { relativeTime } from "./formato";

export type ApprovalTrail = { status?: string; requestedBy?: string; requestedAt?: string; decidedBy?: string; decidedAt?: string; note?: string };
export const APPROVAL_LABEL: Record<string, { label: string; cls: string }> = {
  approved: { label: "Aprobado", cls: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  review: { label: "En revisión", cls: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  draft: { label: "Borrador", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

export function ApprovalSection({ doc, onChanged }: { doc: DbDocument; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const trail = (doc.ocrMetadata?.approval as ApprovalTrail | undefined) ?? {};
  const status = doc.status;

  async function act(action: "request" | "approve" | "reject") {
    setBusy(true);
    try {
      await docApproval(doc.id, action, note.trim() || undefined);
      const nextStatus = action === "request" ? "review" : action === "approve" ? "approved" : "draft";
      const now = new Date().toISOString();
      const nextTrail: ApprovalTrail = action === "request"
        ? { status: "review", requestedBy: "ti", requestedAt: now, note: note.trim() || undefined }
        : { ...trail, status: nextStatus, decidedBy: "ti", decidedAt: now, note: note.trim() || undefined };
      onChanged({ ...doc, status: nextStatus, ocrMetadata: { ...doc.ocrMetadata, approval: nextTrail } });
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  const badge = APPROVAL_LABEL[status];

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* `flex` y no `inline-flex`: un párrafo inline no corta la línea, así
          que el botón de abajo se le subía al lado y le pisaba el título. */}
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Shield className="h-4 w-4 text-primary" /> Aprobación
        {badge && <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold", badge.cls)}>{badge.label}</span>}
      </p>

      {(trail.requestedAt || trail.decidedAt) && (
        <div className="mb-3 space-y-0.5 text-xs text-[var(--text-tertiary)]">
          {trail.requestedAt && <p>Enviado a revisión por {trail.requestedBy} · {relativeTime(trail.requestedAt)}</p>}
          {trail.decidedAt && <p>{status === "approved" ? "Aprobado" : "Decidido"} por {trail.decidedBy} · {relativeTime(trail.decidedAt)}{trail.note ? ` — "${trail.note}"` : ""}</p>}
        </div>
      )}

      {status === "review" ? (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="mb-2 h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => act("approve")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 min-h-10 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-[var(--accent)]"><Check className="h-4 w-4" /> Aprobar</button>
            <button onClick={() => act("reject")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--data-error-500)]/40 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 disabled:opacity-50 dark:text-[var(--data-error-500)]"><X className="h-4 w-4" /> Rechazar</button>
          </div>
        </>
      ) : status === "approved" ? (
        <button onClick={() => act("request")} disabled={busy} className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-primary disabled:opacity-50">Reabrir revisión</button>
      ) : (
        <button onClick={() => act("request")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 min-h-10 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"><PencilLine className="h-4 w-4" /> Solicitar aprobación</button>
      )}
    </section>
  );
}

// ── Permisos por documento (roles que pueden verlo) ──────────────────────────