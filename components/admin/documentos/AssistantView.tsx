"use client";

import { useRef, useState } from "react";
import { Sparkles, Send, FileText, Loader2, User, Bot, PenLine, Share2, CheckCircle2 } from "lucide-react";
import { askDocAssistant, type DocAssistantAnswer } from "@/hooks/use-documents";

type Turn = { q: string; a: DocAssistantAnswer | null; error?: boolean };

const SUGGESTIONS = [
  "¿Dónde está el contrato del local?",
  "¿Qué documentos vencen pronto?",
  "Mostrame los recibos de pago",
];

/** Asistente de documentos: preguntá en lenguaje natural y encontrá el doc + la info. */
export function AssistantView({
  onOpenDoc,
  onSign,
  onShare,
  onApprove,
  indexableCount,
  onIndexAll,
}: {
  onOpenDoc: (id: string) => void;
  onSign: (id: string) => void;
  onShare: (id: string) => void;
  onApprove: (id: string) => void;
  indexableCount: number;
  onIndexAll: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const runIndexAll = async () => {
    if (indexing) return;
    setIndexing({ done: 0, total: indexableCount });
    try {
      await onIndexAll((done, total) => setIndexing({ done, total }));
    } finally {
      setTimeout(() => setIndexing(null), 1500);
    }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    const history = turns.filter((t) => t.a && !t.error).slice(-4).map((t) => ({ q: t.q, a: t.a!.answer.slice(0, 1000) }));
    setTurns((t) => [...t, { q, a: null }]);
    setLoading(true);
    try {
      const res = await askDocAssistant(q, history);
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a: res } : turn)));
    } catch {
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a: null, error: true } : turn)));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    }
  };

  return (
    <div className="flex h-[68vh] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]"><Sparkles className="h-3.5 w-3.5" /></span>
          Asistente de documentos
        </p>
        {indexing ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Indexando {indexing.done}/{indexing.total}</span>
        ) : indexableCount > 0 ? (
          <button onClick={runIndexAll} className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--accent)]/40 px-2 py-0.5 text-xs font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10">
            <Sparkles className="h-3 w-3" /> Indexar {indexableCount}
          </button>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]"><Sparkles className="h-7 w-7" /></span>
            <p className="text-base font-extrabold text-[var(--text-primary)]">Preguntá por tus documentos</p>
            <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">Describí lo que buscás en tus palabras y te encuentro el documento + la información que necesitás.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-start justify-end gap-2">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm font-medium text-white">{t.q}</div>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><User className="h-3.5 w-3.5" /></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]"><Bot className="h-3.5 w-3.5" /></span>
                <div className="max-w-[85%] space-y-2">
                  {t.a === null && !t.error ? (
                    <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-[var(--surface-sunken)] px-3.5 py-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</div>
                  ) : t.error ? (
                    <div className="rounded-2xl rounded-tl-sm bg-[var(--data-error-50)] px-3.5 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">No pude procesar la pregunta. Reintentá.</div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[var(--surface-sunken)] px-3.5 py-2 text-sm text-[var(--text-primary)]">{t.a!.answer}</div>
                      {t.a!.matchedDocs.length > 0 && (
                        <div className="space-y-1.5">
                          {t.a!.matchedDocs.map((d) => (
                            <div key={d.id} className="overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-white">
                              <button
                                onClick={() => onOpenDoc(d.id)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><FileText className="h-4 w-4" /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{d.name}</span>
                                  <span className="block truncate text-xs capitalize text-[var(--text-tertiary)]">{d.category}</span>
                                </span>
                              </button>
                              <div className="flex items-center gap-1 border-t border-[var(--rule-base)] px-2 py-1">
                                {approvedIds.has(d.id) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"><CheckCircle2 className="h-3.5 w-3.5" /> Aprobado</span>
                                ) : (
                                  ([
                                    { icon: PenLine, label: "Firmar", fn: onSign },
                                    { icon: Share2, label: "Compartir", fn: onShare },
                                    { icon: CheckCircle2, label: "Aprobar", fn: onApprove },
                                  ] as const).map(({ icon: Icon, label, fn }) => (
                                    <button
                                      key={label}
                                      onClick={() => { fn(d.id); if (label === "Aprobar") setApprovedIds((s) => new Set(s).add(d.id)); }}
                                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-primary"
                                    >
                                      <Icon className="h-3.5 w-3.5" /> {label}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[var(--rule-base)] p-3">
        <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 focus-within:border-primary">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(input); }}
            placeholder="Preguntá algo sobre tus documentos…"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[var(--text-primary)] outline-none"
          />
          <button
            onClick={() => ask(input)}
            disabled={loading || !input.trim()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity hover:bg-primary-dark disabled:opacity-40"
            aria-label="Preguntar"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
