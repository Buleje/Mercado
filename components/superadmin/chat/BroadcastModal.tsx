"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, X, Loader2, Users, Send } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

const STATUS_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Activos" },
  { id: "trial", label: "En trial" },
  { id: "expired_trial", label: "Trial vencido" },
  { id: "inactive", label: "Inactivos" },
];
const PLAN_OPTIONS = ["", "free", "starter", "pro", "business", "enterprise"];

export function BroadcastModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadPreview = useCallback(async () => {
    const p = new URLSearchParams({ status });
    if (plan) p.set("plan", plan);
    try {
      const r = await fetch(`/api/superadmin/chat/broadcast?${p}`, { credentials: "include" });
      const data = await r.json();
      setCount(data.count ?? 0);
      setSample(data.sample ?? []);
    } catch {
      setCount(null);
    }
  }, [status, plan]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  const handleSend = async () => {
    if (!body.trim() || sending || !count) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch(`/api/superadmin/chat/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status, plan: plan || undefined, body: body.trim() }),
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
            <Megaphone className="h-5 w-5 text-[var(--accent)]" /> Broadcast a tenants
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)]">
                {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Plan</span>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)]">
                {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p === "" ? "Todos los planes" : p}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent)]">
            <Users className="h-4 w-4" />
            {count === null ? "Calculando…" : `${count} tenant${count === 1 ? "" : "s"} en el segmento`}
            {sample.length > 0 && (
              <span className="ml-1 truncate text-xs font-medium text-[var(--text-secondary)]">
                ({sample.map((s) => s.name).slice(0, 3).join(", ")}{count && count > 3 ? "…" : ""})
              </span>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Mensaje del anuncio para todos los tenants del segmento…"
            className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {err && <p className="text-sm font-semibold text-[var(--data-error-600,#dc2626)]">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 h-10 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={handleSend} disabled={sending || !body.trim() || !count} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 h-10 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar a {count ?? 0}
          </button>
        </div>
      </div>
    </div>
  );
}
