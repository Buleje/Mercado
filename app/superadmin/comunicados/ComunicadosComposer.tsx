"use client";

/**
 * ComunicadosComposer — comunicados segmentados (Brandon 2026-06-19, idea #B).
 * Elegís un segmento inteligente (en riesgo, no usan Marketplace/Fiado, trial
 * por vencer, pagados, todos), ves los destinatarios, escribís el mensaje y lo
 * mandás. Segmentos de /api/superadmin/comunicados; el envío reusa el broadcast
 * existente (/api/superadmin/chat/broadcast).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, Users, Send, RefreshCw, Loader2, CheckCircle2 } from "@buleje/design-system/icons";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { csrfHeaders } from "@/lib/csrf-client";

type Recipient = { id: string; name: string };
type Segment = { key: string; label: string; hint: string; recipients: Recipient[] };

export function ComunicadosComposer() {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("en-riesgo");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/comunicados", { credentials: "include", cache: "no-store" });
      if (res.ok) setSegments((await res.json()).segments as Segment[]);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 120_000);

  const seg = useMemo(() => segments?.find((s) => s.key === selected) ?? segments?.[0] ?? null, [segments, selected]);

  const send = useCallback(async () => {
    if (!seg || !msg.trim() || seg.recipients.length === 0) return;
    if (!window.confirm(`¿Enviar este mensaje a ${seg.recipients.length} negocio(s) del segmento "${seg.label}"?`)) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/superadmin/chat/broadcast", {
        method: "POST", credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "all", tenantIds: seg.recipients.map((r) => r.id), body: msg.trim() }),
      });
      if (res.ok) { setResult(`Enviado a ${seg.recipients.length} negocio(s) ✓`); setMsg(""); }
      else { const e = await res.json().catch(() => ({})); setResult(`No se pudo enviar: ${e.error ?? res.status}`); }
    } catch { setResult("Error al enviar"); } finally { setSending(false); }
  }, [seg, msg]);

  if (loading && !segments) return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!segments) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      {/* Composer */}
      <div className="space-y-4">
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">1 · Elegí el segmento</p>
            <button type="button" onClick={() => void load()} className="inline-flex h-7 items-center rounded-lg border border-[var(--rule-base)] px-2 text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {segments.map((s) => (
              <button key={s.key} type="button" onClick={() => setSelected(s.key)} className={`inline-flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-left transition-colors ${selected === s.key ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--rule-base)] hover:border-[var(--accent)]/40"}`}>
                <span className="text-sm font-bold text-[var(--text-primary)]">{s.label} <span className="tabular-nums text-[var(--accent)]">{s.recipients.length}</span></span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{s.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">2 · Escribí el mensaje</p>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} maxLength={2000} placeholder="¡Hola! Te escribo del equipo Buleje para contarte que…" className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] resize-y" />
          <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{msg.length}/2000 · llega a <strong className="text-[var(--text-primary)]">{seg?.recipients.length ?? 0}</strong> negocio(s)</span>
            <div className="flex items-center gap-2">
              {result && <span className={`text-xs font-bold ${result.includes("✓") ? "text-[var(--data-success-600,#059669)]" : "text-[var(--data-error-600,#dc2626)]"}`}>{result}</span>}
              <button type="button" onClick={() => void send()} disabled={sending || !msg.trim() || !seg || seg.recipients.length === 0} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sending ? "Enviando…" : "Enviar comunicado"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Destinatarios */}
      <aside className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden h-fit">
        <header className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
          <Users className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Destinatarios ({seg?.recipients.length ?? 0})</h3>
        </header>
        <div className="p-3 max-h-[420px] overflow-y-auto">
          {!seg || seg.recipients.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[var(--data-success-600,#059669)]" /> Ningún negocio en este segmento.</p>
          ) : (
            <ul className="space-y-1">
              {seg.recipients.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm"><Megaphone className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" /> <span className="truncate text-[var(--text-primary)]">{r.name}</span></li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
