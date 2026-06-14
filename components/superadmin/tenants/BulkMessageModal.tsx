"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X, Loader2, Send } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Enviar un mensaje a los tenants seleccionados (bundle B · /superadmin/tenants).
 * Reusa el broadcast del Messenger (acepta tenantIds explícitos). Crea/reusa una
 * conversación de plataforma por tenant con el mensaje.
 */
export function BulkMessageModal({
  tenantIds,
  count,
  onClose,
  onSent,
}: {
  tenantIds: string[];
  count: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    if (!body.trim() || sending || tenantIds.length === 0) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch("/api/superadmin/chat/broadcast", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tenantIds, body: body.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "error");
      }
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo enviar");
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-raised)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
            <MessageSquare className="h-5 w-5 text-[var(--accent)]" /> Mensaje a {count} tienda{count === 1 ? "" : "s"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Se enviará por el chat de la plataforma a cada negocio seleccionado. Lo verán en su panel.
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Escribí el mensaje para los negocios seleccionados…"
            className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {err && <p className="text-sm font-semibold text-[var(--data-error-600,#dc2626)]">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 h-10 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={send} disabled={sending || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 h-10 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar a {count}
          </button>
        </div>
      </div>
    </div>
  );
}
