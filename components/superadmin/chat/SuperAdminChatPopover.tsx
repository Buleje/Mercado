"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Send, Loader2, ArrowLeft, ExternalLink, X, Megaphone,
} from "@buleje/design-system/icons";
import type { PlatformConversation, PlatformMessage } from "./types";
import { csrfHeaders } from "@/lib/csrf-client";

function ago(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Popover Messenger en el header del superadmin: chat directo y rápido con los
 * negocios sin salir de la página actual. Lista → mini-hilo → composer.
 * "Ver todo" lleva al Messenger completo (/superadmin/chat). Messenger ADR-132.
 */
export default function SuperAdminChatPopover() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conversations, setConversations] = useState<PlatformConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlatformMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const r = await fetch("/api/superadmin/chat/conversations?status=open", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setUnread(d.unread ?? 0);
      setConversations(d.conversations ?? []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => { void refreshUnread(); }, [refreshUnread]);

  // Click-outside + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (open) void refreshUnread(); }, [open, refreshUnread]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [messages]);

  const openThread = async (id: string) => {
    setSelectedId(id);
    setLoading(true);
    setMessages([]);
    try {
      const r = await fetch(`/api/superadmin/chat/conversations/${id}`, { credentials: "include" });
      const d = await r.json();
      setMessages(d.messages ?? []);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadForPlatform: 0 } : c)));
      void refreshUnread();
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!selectedId || !text.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/superadmin/chat/conversations/${selectedId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: text.trim() }),
      });
      const d = await r.json();
      if (r.ok) { setMessages((prev) => [...prev, d.message]); setText(""); void refreshUnread(); }
    } finally {
      setSending(false);
    }
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat con negocios"
        title="Chat con negocios"
        className="relative p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <MessageSquare className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 flex h-[520px] w-[min(92vw,400px)] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-base)] px-4 py-3">
            {selected ? (
              <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                <ArrowLeft className="h-4 w-4" /> <span className="truncate max-w-[180px]">{selected.tenantName}</span>
              </button>
            ) : (
              <span className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
                <MessageSquare className="h-4 w-4 text-[var(--accent)]" /> Chat con negocios
              </span>
            )}
            <div className="flex items-center gap-1">
              <Link href="/superadmin/chat" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]">
                Ver todo <ExternalLink className="h-3 w-3" />
              </Link>
              <button onClick={() => setOpen(false)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {!selected ? (
            /* Lista */
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-[var(--text-tertiary)]">
                  <MessageSquare className="h-7 w-7" strokeWidth={1.5} />
                  <p className="text-sm font-medium">Sin conversaciones</p>
                  <Link href="/superadmin/chat" onClick={() => setOpen(false)} className="text-sm font-bold text-[var(--accent)]">Iniciar una</Link>
                </div>
              ) : (
                conversations.map((c) => (
                  <button key={c.id} onClick={() => openThread(c.id)} className="w-full border-b border-[var(--rule-soft)] px-4 py-2.5 text-left hover:bg-[var(--surface-sunken)] transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-[var(--text-primary)]">{c.tenantName}</span>
                      <span className="shrink-0 text-[10px] font-semibold text-[var(--text-tertiary)]">{ago(c.lastMessageAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-[var(--text-secondary)]">{c.lastSenderType === "platform" ? "Vos: " : ""}{c.lastMessageText ?? "—"}</span>
                      {c.unreadForPlatform > 0 && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white">{c.unreadForPlatform}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* Mini-hilo + composer */
            <>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[var(--surface-canvas)]">
                {loading ? (
                  <p className="text-center text-xs text-[var(--text-tertiary)]">Cargando…</p>
                ) : (
                  messages.filter((m) => !m.isInternalNote).map((m) => {
                    const mine = m.senderType === "platform";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${mine ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]"}`}>
                          {m.messageType === "broadcast" && (
                            <p className={`mb-0.5 flex items-center gap-1 text-[9px] font-black uppercase ${mine ? "text-white/80" : "text-[var(--accent)]"}`}><Megaphone className="h-2.5 w-2.5" /> Anuncio</p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-[var(--rule-base)] p-2.5">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1}
                  placeholder={`Escribile a ${selected.tenantName}…`}
                  className="flex-1 resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button onClick={send} disabled={sending || !text.trim()} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
