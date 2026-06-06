"use client";

/**
 * AdminChatHead — burbuja flotante de chat para el PANEL ADMIN del negocio.
 *
 * Brandon 2026-06-06: cuando un cliente escribe al negocio, aparece una
 * burbuja flotante (estilo Facebook) abajo a la derecha del admin con el
 * avatar del cliente + badge de no-leídos. Click → mini-ventana de chat
 * para responder SIN salir del tab actual. "Ver todos" → tab marketplace-chat.
 *
 * Sistema D2 (ConversationThread) — mismos endpoints que el ChatTab:
 *   GET  /api/admin/chat/threads?status=open        (bandeja, unreadForSeller)
 *   GET  /api/admin/chat/threads/[id]/messages      (lista + marca leído seller)
 *   POST /api/admin/chat/threads/[id]/messages      (responder como tienda)
 *
 * Polling 20s para el badge; 5s con la ventana abierta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Loader2, ChevronRight, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { ChatThreadView, ChatMessageView } from "@/components/admin/ChatTab/types";

const POLL_IDLE_MS = 20_000;
const POLL_CHAT_MS = 5_000;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function shortAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default function AdminChatHead() {
  const [threads, setThreads] = useState<ChatThreadView[]>([]);
  const [openList, setOpenList] = useState(false);
  const [active, setActive] = useState<ChatThreadView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // ── Polling de threads (badge) ──────────────────────────────────────
  const refreshThreads = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/chat/threads?status=open");
      if (!res.ok) return;
      const j = (await res.json()) as { data: ChatThreadView[] };
      setThreads(j.data ?? []);
    } catch { /* polling no crítico */ }
  }, []);

  useEffect(() => {
    void refreshThreads();
    const interval = window.setInterval(refreshThreads, active ? POLL_CHAT_MS : POLL_IDLE_MS);
    return () => window.clearInterval(interval);
  }, [refreshThreads, active]);

  // ── Mensajes del thread activo (el GET marca leído seller-side) ────
  const fetchMessages = useCallback(async () => {
    if (!active) return;
    try {
      const res = await tenantFetch(`/api/admin/chat/threads/${active.id}/messages`);
      if (!res.ok) return;
      const j = (await res.json()) as { data: ChatMessageView[] };
      setMessages(j.data ?? []);
    } catch { /* polling no crítico */ }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoadingMsgs(true);
    (async () => {
      await fetchMessages();
      if (!cancelled) setLoadingMsgs(false);
    })();
    const interval = window.setInterval(fetchMessages, POLL_CHAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, fetchMessages]);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages.length]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !active) return;
    setSending(true);
    try {
      const res = await tenantFetch(`/api/admin/chat/threads/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        setText("");
        await fetchMessages();
      }
    } catch { /* el próximo poll reconcilia */ } finally {
      setSending(false);
    }
  };

  const unreadThreads = threads.filter((t) => t.unreadForSeller > 0);
  const unreadTotal = unreadThreads.reduce((n, t) => n + t.unreadForSeller, 0);

  // Sin nada pendiente y sin ventana abierta → invisible (no estorba).
  if (unreadTotal === 0 && !openList && !active) return null;

  const headThread = unreadThreads[0] ?? threads[0];

  return (
    <>
      {/* ── Burbuja flotante — avatar del cliente + badge ── */}
      {!openList && !active && headThread && (
        <button
          type="button"
          onClick={() => (unreadThreads.length === 1 ? setActive(unreadThreads[0]) : setOpenList(true))}
          aria-label={`Mensajes de clientes — ${unreadTotal} sin leer`}
          title={`${headThread.customerName}: ${headThread.lastMessageText ?? ""}`}
          className="fixed bottom-24 right-4 z-40 motion-safe:animate-[slideUp_0.3s_ease-out]"
        >
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] text-white shadow-xl shadow-black/25 ring-2 ring-white/80 transition-transform hover:scale-110 active:scale-95">
            <span className="text-lg font-black uppercase">
              {headThread.customerName?.[0] ?? <User className="h-6 w-6" strokeWidth={2} aria-hidden />}
            </span>
            <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500,#e11d48)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-white">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          </span>
        </button>
      )}

      {/* ── Lista mini (si hay varios clientes esperando) ── */}
      {openList && !active && (
        <div className="fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[320px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-[var(--surface-canvas,#fff)] shadow-2xl shadow-black/25 motion-safe:animate-[slideUp_0.25s_ease-out]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] px-3.5 py-2.5">
            <p className="text-sm font-black text-[var(--text-primary,#111)]">
              Clientes esperando
              <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500,#e11d48)] px-1.5 align-middle text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                {unreadTotal}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setOpenList(false)}
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary,#555)] hover:bg-[var(--surface-sunken,#f3f4f6)]"
            >
              <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto p-1.5">
            {unreadThreads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => { setOpenList(false); setActive(t); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--surface-sunken,#f3f4f6)]"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] text-sm font-black uppercase text-white">
                    {t.customerName?.[0] ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-extrabold text-[var(--text-primary,#111)]">
                        {t.customerName}
                      </span>
                      <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary,#888)]">
                        {shortAgo(t.lastMessageAt)}
                      </span>
                    </span>
                    <span className="block truncate text-xs font-medium text-[var(--text-secondary,#555)]">
                      {t.lastMessageText ?? ""}
                    </span>
                  </span>
                  <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                    {t.unreadForSeller}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <a
            href="/admin?tab=marketplace-chat"
            className="flex shrink-0 items-center justify-center gap-1 border-t border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] py-2.5 text-xs font-extrabold uppercase tracking-wider text-[var(--accent,#00A0A0)] hover:underline"
          >
            Ver todos los chats
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </a>
        </div>
      )}

      {/* ── Mini-ventana de chat (responder sin salir del tab) ── */}
      {active && (
        <div
          role="dialog"
          aria-label={`Chat con ${active.customerName}`}
          className="fixed bottom-4 right-4 z-50 flex h-[440px] w-[330px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-[var(--surface-canvas,#fff)] shadow-2xl shadow-black/30 motion-safe:animate-[slideUp_0.25s_ease-out]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] px-3 py-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] text-sm font-black uppercase text-white">
              {active.customerName?.[0] ?? "?"}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-extrabold text-[var(--text-primary,#111)]">
                {active.customerName}
              </span>
              <span className="block truncate text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary,#888)]">
                {active.customerPhone}
              </span>
            </span>
            <button
              type="button"
              onClick={() => { setActive(null); setMessages([]); void refreshThreads(); }}
              aria-label="Cerrar chat"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary,#555)] hover:bg-[var(--surface-sunken,#f3f4f6)]"
            >
              <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>

          {/* Mensajes — la TIENDA a la derecha (accent), el cliente a la izquierda */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            {loadingMsgs ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm font-bold text-[var(--text-tertiary,#888)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cargando…
              </div>
            ) : (
              <ul className="space-y-1.5">
                {messages.map((m) => {
                  const mine = m.senderType === "seller";
                  const isSystem = m.senderType === "system";
                  if (isSystem) {
                    return (
                      <li key={m.id} className="my-1.5 flex justify-center">
                        <span className="max-w-[85%] rounded-xl bg-[var(--surface-sunken,#f3f4f6)] px-3 py-1.5 text-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary,#888)]">
                          {m.body}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[82%] rounded-2xl px-3 py-2 shadow-sm",
                          mine
                            ? "rounded-br-md bg-[var(--accent,#00A0A0)] text-white"
                            : "rounded-bl-md border border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] text-[var(--text-primary,#111)]",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">{m.body}</p>
                        <p className={cn(
                          "mt-0.5 text-right text-[length:var(--ts-2xs)] font-bold tabular-nums",
                          mine ? "text-white/75" : "text-[var(--text-tertiary,#888)]",
                        )}>
                          {hhmm(m.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder={`Responder a ${active.customerName?.split(" ")[0] ?? "cliente"}…`}
                aria-label="Responder al cliente"
                className="block h-11 min-w-0 flex-1 rounded-full border-2 border-[var(--rule-base,#e5e7eb)] bg-[var(--surface-canvas,#fff)] px-4 text-sm font-medium text-[var(--text-primary,#111)] outline-none focus:border-[var(--accent,#00A0A0)]"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sending}
                aria-label="Enviar respuesta"
                className={cn(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                  text.trim() && !sending
                    ? "bg-[var(--accent,#00A0A0)] text-white shadow-md hover:brightness-110"
                    : "bg-[var(--surface-sunken,#f3f4f6)] text-[var(--text-tertiary,#888)] cursor-not-allowed",
                )}
              >
                {sending
                  ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  : <Send className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
