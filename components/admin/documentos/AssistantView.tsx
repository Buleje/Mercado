"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, FileText, Loader2, User, Bot, PenLine, Share2, CheckCircle2, History, Plus, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { askDocAssistantStream, type DocAssistantAnswer } from "@/hooks/use-documents";

type Turn = { q: string; a: DocAssistantAnswer | null; partial?: string; error?: boolean };

const SUGGESTIONS = [
  "¿Dónde está el contrato del local?",
  "¿Qué documentos vencen pronto?",
  "Mostrame los recibos de pago",
];

// Historial de conversaciones persistido en localStorage (por-dispositivo).
type Conversation = { id: string; title: string; turns: Turn[]; updatedAt: number };
const CONVOS_KEY = "doc-assistant-conversations";
const newConvoId = () => `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
function loadConvos(): Conversation[] {
  try { const raw = localStorage.getItem(CONVOS_KEY); return raw ? (JSON.parse(raw) as Conversation[]) : []; } catch { return []; }
}
function saveConvos(list: Conversation[]) {
  try { localStorage.setItem(CONVOS_KEY, JSON.stringify(list.slice(0, 30))); } catch { /* quota */ }
}
function convoDate(ts: number): string {
  const d = Math.round((Date.now() - ts) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

/** Asistente de documentos: preguntá en lenguaje natural y encontrá el doc + la info. */
export function AssistantView({
  onOpenDoc,
  onSign,
  onShare,
  onApprove,
  indexableCount,
  onIndexAll,
  reindexableCount,
  onReindexAll,
}: {
  onOpenDoc: (id: string) => void;
  onSign: (id: string) => void;
  onShare: (id: string) => void;
  onApprove: (id: string) => void;
  indexableCount: number;
  onIndexAll: (onProgress: (done: number, total: number) => void) => Promise<void>;
  reindexableCount: number;
  onReindexAll: (onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showConvos, setShowConvos] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Cargar el historial persistido al montar.
  useEffect(() => { setConversations(loadConvos()); }, []);

  // Guardar la conversación activa cuando termina un turno (no mid-stream).
  useEffect(() => {
    if (turns.length === 0) return;
    const last = turns[turns.length - 1];
    if (!last.a && !last.error) return;
    const id = activeId ?? newConvoId();
    if (!activeId) setActiveId(id);
    setConversations((prev) => {
      const title = (turns[0]?.q ?? "Conversación").slice(0, 50);
      const next = [{ id, title, turns, updatedAt: Date.now() }, ...prev.filter((c) => c.id !== id)];
      saveConvos(next);
      return next;
    });
  }, [turns, activeId]);

  const newConversation = () => { setTurns([]); setActiveId(null); setApprovedIds(new Set()); setShowConvos(false); };
  const loadConversation = (c: Conversation) => { setTurns(c.turns); setActiveId(c.id); setShowConvos(false); };
  const deleteConversation = (id: string) => {
    setConversations((prev) => { const next = prev.filter((c) => c.id !== id); saveConvos(next); return next; });
    if (activeId === id) newConversation();
  };

  const runIndex = async (mode: "new" | "all") => {
    if (indexing) return;
    if (mode === "all" && !confirm(`¿Re-describir los ${reindexableCount} documentos con IA? Los ya analizados también se actualizan con la descripción rica.`)) return;
    setIndexing({ done: 0, total: mode === "all" ? reindexableCount : indexableCount });
    try {
      await (mode === "all" ? onReindexAll : onIndexAll)((done, total) => setIndexing({ done, total }));
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
      const res = await askDocAssistantStream(q, history, (partial) => {
        setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, partial } : turn)));
      });
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a: res, partial: undefined } : turn)));
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
        <div className="flex items-center gap-1.5">
          {indexing ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Indexando {indexing.done}/{indexing.total}</span>
          ) : (
            <>
              {indexableCount > 0 && (
                <button onClick={() => runIndex("new")} className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--accent)]/40 px-2 py-0.5 text-xs font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10">
                  <Sparkles className="h-3 w-3" /> Indexar {indexableCount}
                </button>
              )}
              {reindexableCount > 0 && (
                <button onClick={() => runIndex("all")} className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary" title="Re-describir TODOS los documentos con IA (los viejos ganan la descripción rica)">
                  <RefreshCw className="h-3 w-3" /> Re-indexar todo
                </button>
              )}
            </>
          )}
          {conversations.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowConvos((s) => !s)} className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary" title="Conversaciones guardadas">
                <History className="h-3 w-3" /> {conversations.length}
              </button>
              {showConvos && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl">
                  {conversations.map((c) => (
                    <div key={c.id} className={cn("group flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-[var(--surface-sunken)]", c.id === activeId && "bg-primary/10")}>
                      <button onClick={() => loadConversation(c)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{c.title}</span>
                        <span className="block text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">{convoDate(c.updatedAt)}</span>
                      </button>
                      <button onClick={() => deleteConversation(c.id)} className="shrink-0 rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--data-error-700)] group-hover:opacity-100" aria-label="Borrar conversación"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {turns.length > 0 && (
            <button onClick={newConversation} className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary" title="Nueva conversación">
              <Plus className="h-3 w-3" /> Nueva
            </button>
          )}
        </div>
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
                    t.partial ? (
                      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[var(--surface-sunken)] px-3.5 py-2 text-sm text-[var(--text-primary)]">{t.partial}<span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-[var(--accent)] align-middle" /></div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-[var(--surface-sunken)] px-3.5 py-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</div>
                    )
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
