"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Send, Loader2, ArrowLeft, Megaphone, ShieldCheck,
} from "@buleje/design-system/icons";
import type { PlatformConversation, PlatformMessage } from "@/components/superadmin/chat/types";
import { csrfHeaders } from "@/lib/csrf-client";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Bandeja de la PLATAFORMA en el panel del negocio. El dueño lee y responde los
 * mensajes que le manda Buleje (superadmin). Lado tenant del Messenger ADR-132.
 */
export default function PlatformInboxPanel() {
  const [conversations, setConversations] = useState<PlatformConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlatformMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/platform-chat", { credentials: "include" });
      const d = await r.json();
      setConversations(d.conversations ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const open = async (id: string) => {
    setSelectedId(id);
    setMessages([]);
    try {
      const r = await fetch(`/api/admin/platform-chat/${id}/messages`, { credentials: "include" });
      const d = await r.json();
      setMessages(d.messages ?? []);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadForTenant: 0 } : c)));
    } catch {
      /* silent */
    }
  };

  const send = async () => {
    if (!selectedId || !text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/platform-chat/${selectedId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: text.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessages((prev) => [...prev, d.message]);
        setText("");
      }
    } finally {
      setSending(false);
    }
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-5xl flex-col bg-[var(--surface-canvas)]">
      <header className="flex items-center gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <Link href="/admin" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-base font-extrabold text-[var(--text-primary)] leading-none">Mensajes de Buleje</p>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Soporte y anuncios del equipo de la plataforma</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`${selectedId ? "hidden sm:flex" : "flex"} w-full sm:w-72 shrink-0 flex-col border-r border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-y-auto`}>
          {loading ? (
            <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">Cargando…</p>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-[var(--text-tertiary)]">
              <MessageSquare className="h-8 w-8" strokeWidth={1.5} />
              <p className="text-sm font-medium">Sin mensajes de Buleje todavía</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className={`w-full border-b border-[var(--rule-soft)] px-4 py-3 text-left transition-colors ${selectedId === c.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-sunken)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-[var(--text-primary)]">{c.subject ?? "Buleje"}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-[var(--text-tertiary)]">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-[var(--text-secondary)]">{c.lastMessageText ?? "—"}</span>
                  {c.unreadForTenant > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-black text-white">{c.unreadForTenant}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </aside>

        <section className={`${selectedId ? "flex" : "hidden sm:flex"} flex-1 flex-col min-w-0`}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-tertiary)]">Elegí un mensaje</div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((m) => {
                  const mine = m.senderType === "tenant";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]"}`}>
                        {m.messageType === "broadcast" && (
                          <p className={`mb-0.5 flex items-center gap-1 text-[10px] font-black uppercase ${mine ? "text-white/80" : "text-[var(--accent)]"}`}><Megaphone className="h-3 w-3" /> Anuncio</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[var(--text-tertiary)]"}`}>{timeAgo(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={2}
                  placeholder="Escribile a Buleje…"
                  className="flex-1 resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button onClick={send} disabled={sending || !text.trim()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
