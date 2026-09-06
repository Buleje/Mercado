"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Send,
  Sparkles,
  Megaphone,
  Plus,
  StickyNote,
  Loader2,
  MessageSquare,
  ChevronDown,
  Check,
  FileText,
  AlertCircle,
} from "@buleje/design-system/icons";
import {
  type PlatformConversation,
  type PlatformMessage,
  type PlatformConvStatus,
  type PlatformPriority,
  PRIORITY_META,
  QUICK_TEMPLATES,
} from "./types";
import { BroadcastModal } from "./BroadcastModal";
import { NewConversationModal } from "./NewConversationModal";
import { csrfHeaders } from "@/lib/csrf-client";

const STATUS_TABS: { id: PlatformConvStatus | "all"; label: string }[] = [
  { id: "open", label: "Abiertas" },
  { id: "all", label: "Todas" },
  { id: "closed", label: "Cerradas" },
  { id: "archived", label: "Archivadas" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function SuperAdminMessenger() {
  const [conversations, setConversations] = useState<PlatformConversation[]>([]);
  const [statusTab, setStatusTab] = useState<PlatformConvStatus | "all">("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlatformMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusTab !== "all") params.set("status", statusTab);
    if (search.trim()) params.set("search", search.trim());
    try {
      const r = await fetch(`/api/superadmin/chat/conversations?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("fetch");
      const data = await r.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      console.error("[sa-chat] load conversations failed", err);
      setError("No se pudieron cargar las conversaciones");
    } finally {
      setLoadingList(false);
    }
  }, [statusTab, search]);

  useEffect(() => {
    setLoadingList(true);
    const t = setTimeout(loadConversations, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadConversations, search]);

  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingThread(true);
    setMessages([]);
    try {
      const r = await fetch(`/api/superadmin/chat/conversations/${id}`, { credentials: "include" });
      const data = await r.json();
      setMessages(data.messages ?? []);
      // Reflejar leído en la lista sin refetch completo.
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadForPlatform: 0 } : c)),
      );
    } catch (err) {
      console.error("[sa-chat] open conversation failed", err);
      setError("No se pudo abrir la conversación");
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Deep-link desde /superadmin/tenants ("Chatear"): ?c=<conv> abre directo;
  // ?tenant=<id>&name= hace find-or-create de la conversación. Corre una vez
  // tras la primera carga de la lista. Brandon 2026-06-14 (bundle B).
  const searchParams = useSearchParams();
  const paramHandledRef = useRef(false);
  useEffect(() => {
    if (paramHandledRef.current || loadingList) return;
    const c = searchParams.get("c");
    const tenant = searchParams.get("tenant");
    const name = searchParams.get("name");
    if (c) {
      paramHandledRef.current = true;
      void openConversation(c);
    } else if (tenant) {
      paramHandledRef.current = true;
      const existing = conversations.find((cv) => cv.tenantId === tenant);
      if (existing) {
        void openConversation(existing.id);
      } else {
        fetch("/api/superadmin/chat/conversations", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ tenantId: tenant, tenantName: name ?? undefined }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.conversation) {
              void loadConversations();
              void openConversation(d.conversation.id);
            }
          })
          .catch(() => setError("No se pudo abrir el chat"));
      }
    }
  }, [searchParams, loadingList, conversations, openConversation, loadConversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resolveTemplate = (body: string) =>
    body.replace(/\{tienda\}/g, selected?.tenantName ?? "").replace(/\{plan\}/g, "");

  const handleSend = async () => {
    if (!selectedId || !text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    try {
      const r = await fetch(`/api/superadmin/chat/conversations/${selectedId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body, isInternalNote: internalNote }),
      });
      if (!r.ok) throw new Error("send");
      const data = await r.json();
      setMessages((prev) => [...prev, data.message]);
      setText("");
      if (!internalNote) void loadConversations();
    } catch (err) {
      console.error("[sa-chat] send message failed", err);
      setError("No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const runAi = async (mode: "draft" | "summary" | "tone", tone?: string) => {
    if (!selectedId || aiBusy) return;
    setAiBusy(true);
    setShowAi(false);
    try {
      const r = await fetch(`/api/superadmin/chat/ai`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          mode,
          conversationId: selectedId,
          text: mode === "tone" ? text : undefined,
          tone,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.degraded ? "IA no configurada (falta API key)" : "La IA no respondió");
        return;
      }
      if (mode === "summary") {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            conversationId: selectedId,
            tenantId: "",
            senderType: "system",
            senderName: "Resumen IA",
            senderId: null,
            body: data.result,
            messageType: "system_event",
            attachmentUrl: null,
            isInternalNote: true,
            metadataJson: null,
            readByPlatformAt: null,
            readByTenantAt: null,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setText(data.result);
      }
    } catch (err) {
      console.error("[sa-chat] ai reply failed", err);
      setError("La IA no respondió");
    } finally {
      setAiBusy(false);
    }
  };

  const patchConversation = async (
    patch: Partial<{ status: PlatformConvStatus; priority: PlatformPriority; labels: string[] }>,
  ) => {
    if (!selectedId) return;
    setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
    try {
      await fetch(`/api/superadmin/chat/conversations/${selectedId}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.error("[sa-chat] status change failed", err);
      void loadConversations();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[var(--surface-canvas)]">
      {/* ── Columna izquierda: lista ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--rule-base)]">
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">Chat</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowBroadcast(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 h-8 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              title="Broadcast a varios tenants"
            >
              <Megaphone className="h-3.5 w-3.5" /> Broadcast
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 h-8 text-xs font-bold text-white hover:opacity-90 transition-opacity"
              title="Nueva conversación"
            >
              <Plus className="h-4 w-4" /> Nueva
            </button>
          </div>
        </div>
        <div className="px-3 py-2.5 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-2 h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 focus-within:border-[var(--accent)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tienda o mensaje..."
              className="w-full bg-transparent text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setStatusTab(t.id)}
                className={`rounded-full px-2.5 h-7 text-xs font-bold transition-colors ${statusTab === t.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">Cargando…</div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-[var(--text-tertiary)]">
              <MessageSquare className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm font-medium">No hay conversaciones</p>
              <button
                onClick={() => setShowNew(true)}
                className="text-sm font-bold text-[var(--accent)]"
              >
                Iniciar una
              </button>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--rule-soft)] transition-colors ${selectedId === c.id ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_META[c.priority].dot}`}
                    />
                    <span className="truncate text-sm font-bold text-[var(--text-primary)]">
                      {c.tenantName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--text-tertiary)] tabular-nums">
                    {timeAgo(c.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-[var(--text-secondary)]">
                    {c.lastSenderType === "platform" ? "Vos: " : ""}
                    {c.lastMessageText ?? c.subject ?? "Sin mensajes"}
                  </span>
                  {c.unreadForPlatform > 0 && (
                    <span className="shrink-0 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-black text-white tabular-nums">
                      {c.unreadForPlatform}
                    </span>
                  )}
                </div>
                {c.labels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.labels.slice(0, 3).map((l) => (
                      <span
                        key={l}
                        className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Centro: hilo + composer ── */}
      <section className="flex flex-1 flex-col min-w-0">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
            <MessageSquare className="h-12 w-12" strokeWidth={1.25} />
            <p className="text-sm font-medium">Elegí una conversación o iniciá una nueva</p>
          </div>
        ) : (
          <>
            {/* Header del hilo + triage */}
            <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-[var(--text-primary)]">
                  {selected.tenantName}
                </p>
                <p className="truncate text-xs text-[var(--text-tertiary)]">
                  {selected.subject ?? "Conversación de plataforma"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selected.priority}
                  onChange={(e) =>
                    patchConversation({ priority: e.target.value as PlatformPriority })
                  }
                  className="h-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)]"
                >
                  <option value="high">Prioridad alta</option>
                  <option value="medium">Prioridad media</option>
                  <option value="low">Prioridad baja</option>
                </select>
                <select
                  value={selected.status}
                  onChange={(e) =>
                    patchConversation({ status: e.target.value as PlatformConvStatus })
                  }
                  className="h-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)]"
                >
                  <option value="open">Abierta</option>
                  <option value="closed">Cerrada</option>
                  <option value="archived">Archivada</option>
                </select>
              </div>
            </header>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[var(--surface-canvas)]">
              {loadingThread ? (
                <p className="text-center text-sm text-[var(--text-tertiary)]">Cargando…</p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderType === "platform";
                  if (m.isInternalNote) {
                    return (
                      <div
                        key={m.id}
                        className="mx-auto max-w-[80%] rounded-lg border border-[var(--accent)] bg-primary/10 px-3 py-2"
                      >
                        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[var(--accent)]">
                          <StickyNote className="h-3 w-3" /> Nota interna · {m.senderName}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                          {m.body}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[72%] rounded-2xl px-3.5 py-2 ${mine ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                      >
                        {m.messageType === "broadcast" && (
                          <p
                            className={`mb-0.5 flex items-center gap-1 text-xs font-black uppercase ${mine ? "text-white/80" : "text-[var(--accent)]"}`}
                          >
                            <Megaphone className="h-3 w-3" /> Anuncio
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={`mt-1 text-xs tabular-nums ${mine ? "text-white/70" : "text-[var(--text-tertiary)]"}`}
                        >
                          {timeAgo(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowTemplates((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 h-8 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <FileText className="h-3.5 w-3.5" /> Plantillas{" "}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showTemplates && (
                    <div className="absolute bottom-full left-0 mb-1 w-64 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-lg p-1 z-20">
                      {QUICK_TEMPLATES.map((t) => (
                        <button
                          key={t.label}
                          onClick={() => {
                            setText(resolveTemplate(t.body));
                            setShowTemplates(false);
                          }}
                          className="block w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                        >
                          <span className="font-bold text-[var(--text-primary)]">{t.label}</span>
                          <span className="block truncate text-xs text-[var(--text-tertiary)]">
                            {t.body}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowAi((v) => !v)}
                    disabled={aiBusy}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-primary/10 px-2.5 h-8 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/15 disabled:opacity-60"
                  >
                    {aiBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}{" "}
                    IA <ChevronDown className="h-3 w-3" />
                  </button>
                  {showAi && (
                    <div className="absolute bottom-full left-0 mb-1 w-52 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-lg p-1 z-20">
                      <button
                        onClick={() => runAi("draft")}
                        className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                      >
                        ✨ Redactar respuesta
                      </button>
                      <button
                        onClick={() => runAi("summary")}
                        className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                      >
                        📋 Resumir hilo
                      </button>
                      <button
                        onClick={() => runAi("tone", "formal")}
                        className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                      >
                        Tono: formal
                      </button>
                      <button
                        onClick={() => runAi("tone", "cercano")}
                        className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                      >
                        Tono: cercano
                      </button>
                      <button
                        onClick={() => runAi("tone", "breve")}
                        className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)]"
                      >
                        Tono: breve
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setInternalNote((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 h-8 text-xs font-bold transition-colors ${internalNote ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  <StickyNote className="h-3.5 w-3.5" /> {internalNote ? "Nota interna" : "Mensaje"}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={2}
                  placeholder={
                    internalNote
                      ? "Nota interna (solo la ve el equipo)…"
                      : `Escribile a ${selected.tenantName}…`
                  }
                  className={`flex-1 resize-none rounded-xl border-2 px-3 py-2 text-sm text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] outline-none transition-colors ${internalNote ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)] bg-[var(--surface-canvas)] focus:border-[var(--accent)]"}`}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !text.trim()}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 py-2.5 text-sm font-bold text-white shadow-lg">
          <AlertCircle className="h-4 w-4" /> {error}
          <button onClick={() => setError(null)} className="ml-2">
            <Check className="h-4 w-4" />
          </button>
        </div>
      )}

      {showBroadcast && (
        <BroadcastModal
          onClose={() => setShowBroadcast(false)}
          onSent={() => {
            setShowBroadcast(false);
            void loadConversations();
          }}
        />
      )}
      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            void loadConversations();
            openConversation(id);
          }}
        />
      )}
    </div>
  );
}
