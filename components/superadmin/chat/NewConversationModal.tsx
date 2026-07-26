"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, Search, Building2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

type TenantOpt = { id: string; name: string; slug: string };

export function NewConversationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<TenantOpt | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/superadmin/tenants`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows = (d?.tenants ?? d ?? []) as Array<Record<string, unknown>>;
        setTenants(
          rows
            .map((t) => ({ id: String(t.id ?? ""), name: String(t.name ?? t.slug ?? ""), slug: String(t.slug ?? "") }))
            .filter((t) => t.id),
        );
      })
      .catch(() => setErr("No se pudieron cargar los tenants"));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tenants.slice(0, 50);
    return tenants.filter((t) => t.name.toLowerCase().includes(s) || t.slug.toLowerCase().includes(s)).slice(0, 50);
  }, [tenants, q]);

  const handleCreate = async () => {
    if (!selected || creating) return;
    setCreating(true);
    setErr(null);
    try {
      const r = await fetch(`/api/superadmin/chat/conversations`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          tenantId: selected.id,
          tenantName: selected.name,
          subject: subject.trim() || undefined,
          firstMessage: message.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error("error");
      const data = await r.json();
      onCreated(data.conversation.id);
    } catch (err) {
      console.error("[sa-chat] create conversation failed", err);
      setErr("No se pudo crear la conversación");
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-raised)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
            <Plus className="h-5 w-5 text-[var(--accent)]" /> Nueva conversación
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {!selected ? (
            <>
              <div className="flex items-center gap-2 h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 focus-within:border-[var(--accent)]">
                <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tienda…" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none" />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--rule-base)]">
                {filtered.length === 0 ? (
                  <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">Sin resultados</p>
                ) : (
                  filtered.map((t) => (
                    <button key={t.id} onClick={() => setSelected(t)} className="flex w-full items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]">
                      <Building2 className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{t.name}</span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">{t.slug}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-bold text-[var(--accent)]"><Building2 className="h-4 w-4" /> {selected.name}</span>
                <button onClick={() => setSelected(null)} className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cambiar</button>
              </div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto (opcional)" className="w-full h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Primer mensaje (opcional)…" className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            </>
          )}
          {err && <p className="text-sm font-semibold text-[var(--data-error-600)]">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-base)] px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 h-10 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={handleCreate} disabled={!selected || creating} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 h-10 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear
          </button>
        </div>
      </div>
    </div>
  );
}
