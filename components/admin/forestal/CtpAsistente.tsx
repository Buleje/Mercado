"use client";

/**
 * CtpAsistente — "preguntá al Libro" en lenguaje natural.
 *
 * Widget colapsable: el operador escribe una pregunta ("¿cuánto shihuahuaco me
 * queda?", "¿qué despachos no tienen certificado?") y la IA responde SOLO con
 * el resumen real del libro que arma el server (`/ctp/ask`). No inventa cifras.
 */

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { Sparkles, Send, Loader2, X as XIcon } from "@buleje/design-system/icons";

const EJEMPLOS = [
  "¿Cuánto queda de cada especie?",
  "¿Qué despachos no tienen certificado?",
  "¿Tengo algún documento vencido?",
  "¿Cuántos ingresos están fuera de plazo?",
];

export default function CtpAsistente() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (text.length < 3) return;
    setQ(text); setLoading(true); setError(null); setAnswer(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ question: text }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      setAnswer(body.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--brand-ink)] hover:bg-[var(--surface-canvas)]">
        <Sparkles className="h-4 w-4" /> Preguntá al Libro
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Sparkles className="h-4 w-4 text-[var(--brand-ink)]" /> Asistente del Libro</span>
        <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)]" aria-label="Cerrar"><XIcon className="h-4 w-4" /></button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Preguntá sobre existencias, despachos, cumplimiento…" className="h-11 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)]" />
        <button type="submit" disabled={loading || q.trim().length < 3} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--brand-ink)] text-white hover:opacity-90 disabled:opacity-50" aria-label="Preguntar">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EJEMPLOS.map((ej) => (
          <button key={ej} type="button" onClick={() => void ask(ej)} disabled={loading} className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--brand-ink)] hover:text-[var(--text-primary)] disabled:opacity-50">{ej}</button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-[var(--data-error-50)] p-2.5 text-xs font-medium text-[var(--data-error-700)]">{error}</p>}
      {answer && (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-primary)]">{answer}</div>
      )}
      <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Responde con los datos del libro. Verificá cifras críticas en las pestañas.</p>
    </div>
  );
}
