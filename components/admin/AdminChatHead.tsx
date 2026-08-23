"use client";

/**
 * AdminChatHead — chat flotante estilo Facebook para el PANEL ADMIN.
 *
 * Brandon 2026-06-06 v2:
 *   - GLOBOS MÚLTIPLES apilados: uno por cliente con mensajes sin leer
 *     (y los minimizados a mano), avatar inicial + badge por globo
 *   - Cerrar la ventana NO mata el chat → vuelve a globo (minimizado);
 *     solo la X del hover lo quita (sessionStorage)
 *   - Bandeja completa estilo Messenger: la abre el ícono de chat del
 *     nav (evento `buleje:admin-open-chat`); muestra TODOS los threads
 *   - Badge del nav: este componente emite `buleje:admin-chat-unread`
 *     con el total en cada poll
 *
 * Sistema D2 (ConversationThread) — mismos endpoints que el ChatTab:
 *   GET  /api/admin/chat/threads?status=open        (bandeja, unreadForSeller)
 *   GET  /api/admin/chat/threads/[id]/messages      (lista + marca leído seller)
 *   POST /api/admin/chat/threads/[id]/messages      (responder como tienda)
 *
 * Polling 20s para el badge; 5s con la ventana abierta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Loader2, ChevronRight, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { ChatThreadView, ChatMessageView } from "@/components/admin/ChatTab/types";

const POLL_IDLE_MS = 20_000;
const POLL_CHAT_MS = 5_000;
const DISMISS_KEY = "bsm-admin-chat-heads-dismissed";

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
  const [minimizedIds, setMinimizedIds] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // ── Polling de threads (badge + globos) ─────────────────────────────
  const refreshThreads = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/chat/threads?status=open");
      if (!res.ok) return;
      const j = (await res.json()) as { data: ChatThreadView[] };
      const list = j.data ?? [];
      setThreads(list);
      // Badge para el ícono del nav (AdminMensajesMenu escucha)
      const unread = list.reduce((n, t) => n + t.unreadForSeller, 0);
      window.dispatchEvent(new CustomEvent("buleje:admin-chat-unread", { detail: { unread } }));
    } catch { /* polling no crítico */ }
  }, []);

  useEffect(() => {
    void refreshThreads();
    const interval = window.setInterval(refreshThreads, active ? POLL_CHAT_MS : POLL_IDLE_MS);
    return () => window.clearInterval(interval);
  }, [refreshThreads, active]);

  // ── El ícono del nav abre la bandeja completa ───────────────────────
  useEffect(() => {
    const handler = () => {
      setActive(null);
      setOpenList((o) => !o);
      void refreshThreads();
    };
    window.addEventListener("buleje:admin-open-chat", handler);
    return () => window.removeEventListener("buleje:admin-open-chat", handler);
  }, [refreshThreads]);

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

  const openThread = (t: ChatThreadView) => {
    setOpenList(false);
    setMinimizedIds((prev) => prev.filter((id) => id !== t.id));
    setActive(t);
  };

  /** Cerrar la ventana = MINIMIZAR al globo (no desaparece). */
  const minimizeActive = () => {
    if (active) {
      const id = active.id;
      setMinimizedIds((prev) => (prev.includes(id) ? prev : [id, ...prev].slice(0, 4)));
      // Revivir si estaba descartado (lo abrió a propósito)
      setDismissed((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
        return next;
      });
    }
    setActive(null);
    setMessages([]);
    void refreshThreads();
  };

  const dismissHead = (threadId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(threadId);
      try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
    setMinimizedIds((prev) => prev.filter((id) => id !== threadId));
  };

  const unreadTotal = threads.reduce((n, t) => n + t.unreadForSeller, 0);

  // ── Globos: clientes con no-leídos (auto) ∪ minimizados (manual) ────
  const autoHeads = threads.filter(
    (t) => t.unreadForSeller > 0 && !dismissed.has(t.id) && active?.id !== t.id,
  );
  const minimizedHeads = threads.filter(
    (t) =>
      minimizedIds.includes(t.id) &&
      !dismissed.has(t.id) &&
      active?.id !== t.id &&
      !autoHeads.some((a) => a.id === t.id),
  );
  const heads = [...autoHeads, ...minimizedHeads].slice(0, 4);

  return (
    <>
      {/* ── Globos apilados — uno por cliente (avatar + badge + X hover) ── */}
      {!openList && !active && heads.length > 0 && (
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2.5" aria-label="Chats de clientes">
          {heads.map((t) => (
            <div key={t.id} className="group relative motion-safe:animate-[slideUp_0.3s_ease-out]">
              <button
                type="button"
                onClick={() => openThread(t)}
                aria-label={`Chat con ${t.customerName}${t.unreadForSeller > 0 ? ` — ${t.unreadForSeller} sin leer` : ""}`}
                title={`${t.customerName}: ${t.lastMessageText ?? ""}`}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] text-white shadow-xl shadow-black/25 ring-2 ring-white/80 transition-transform hover:scale-110 active:scale-95"
              >
                <span className="text-lg font-black uppercase">{t.customerName?.[0] ?? "?"}</span>
              </button>
              {t.unreadForSeller > 0 && (
                <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500,#e11d48)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-white">
                  {t.unreadForSeller > 9 ? "9+" : t.unreadForSeller}
                </span>
              )}
              {/* Eliminar globo — aparece al hover (estilo FB) */}
              <button
                type="button"
                onClick={() => dismissHead(t.id)}
                aria-label={`Quitar globo de ${t.customerName}`}
                className="absolute -top-1.5 -left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text-primary,#111)] text-[var(--surface-canvas,#fff)] opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="h-3 w-3" strokeWidth={3} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Bandeja completa (la abre el ícono del nav) ── */}
      {openList && !active && (
        <div className="fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[330px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-[var(--surface-canvas,#fff)] shadow-[var(--shadow-xl)] shadow-black/25 motion-safe:animate-[slideUp_0.25s_ease-out]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] px-3.5 py-2.5">
            <p className="text-sm font-black text-[var(--text-primary,#111)]">
              Chats con clientes
              {unreadTotal > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500,#e11d48)] px-1.5 align-middle text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                  {unreadTotal}
                </span>
              )}
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
          {threads.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <span className="mx-auto mb-2.5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken,#f3f4f6)] text-[var(--accent,#00A0A0)]">
                <MessageCircle className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <p className="text-sm font-extrabold text-[var(--text-primary,#111)]">Sin conversaciones aún</p>
              <p className="mt-1 text-xs font-medium text-[var(--text-tertiary,#888)]">
                Cuando un cliente te escriba desde el marketplace, aparece acá.
              </p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto p-1.5">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openThread(t)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--surface-sunken,#f3f4f6)]"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] text-sm font-black uppercase text-white">
                      {t.customerName?.[0] ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn(
                          "truncate text-sm text-[var(--text-primary,#111)]",
                          t.unreadForSeller > 0 ? "font-black" : "font-bold",
                        )}>
                          {t.customerName}
                        </span>
                        <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary,#888)]">
                          {shortAgo(t.lastMessageAt)}
                        </span>
                      </span>
                      <span className={cn(
                        "block truncate text-xs",
                        t.unreadForSeller > 0
                          ? "font-bold text-[var(--text-primary,#111)]"
                          : "font-medium text-[var(--text-secondary,#555)]",
                      )}>
                        {t.lastSenderType === "seller" ? "Tú: " : ""}
                        {t.lastMessageText ?? ""}
                      </span>
                    </span>
                    {t.unreadForSeller > 0 && (
                      <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--accent,#00A0A0)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                        {t.unreadForSeller}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            href="/admin?tab=marketplace-chat"
            className="flex shrink-0 items-center justify-center gap-1 border-t border-[var(--rule-soft,#f0f0f0)] bg-[var(--surface-raised,#fafafa)] py-2.5 text-xs font-extrabold uppercase tracking-wider text-[var(--accent,#00A0A0)] hover:underline"
          >
            Ver panel completo de chats
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </a>
        </div>
      )}

      {/* ── Mini-ventana de chat (responder sin salir del tab) ── */}
      {active && (
        <div
          role="dialog"
          aria-label={`Chat con ${active.customerName}`}
          className="fixed bottom-4 right-4 z-50 flex h-[440px] w-[330px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-[var(--surface-canvas,#fff)] shadow-[var(--shadow-xl)] shadow-black/30 motion-safe:animate-[slideUp_0.25s_ease-out]"
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
              onClick={minimizeActive}
              aria-label="Minimizar chat"
              title="Minimizar — el globo queda flotando"
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
