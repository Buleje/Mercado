"use client";

/**
 * ChatConversationView — conversación 1:1 con una tienda, estilo WhatsApp.
 *
 * v2 (Brandon 2026-06-06) — sistema D2 (threads) con:
 *   - ✓ enviado · ✓✓ leído por la tienda (readBySellerAt) estilo WhatsApp
 *   - Tarjeta de PEDIDO para mensajes order_link (el resumen del checkout)
 *   - Mensajes de sistema centrados
 *   - Quick replies cuando la conversación está vacía
 *   - Thread se crea al primer mensaje (action=open) si aún no existe
 *
 * Polling 5s mientras está abierta; el GET ya marca leído al buyer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Send, Store as StoreIcon, Loader2, ArrowRight, Check, CheckCheck,
  ReceiptText,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

const POLL_MS = 5_000;

interface ThreadMsg {
  id: string;
  senderType: "buyer" | "seller" | "system";
  senderName: string;
  body: string;
  messageType: string;
  attachmentUrl: string | null;
  readBySellerAt: string | null;
  createdAt: string;
}

interface Props {
  threadId: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  customerPhone: string;
  customerName: string;
  onBack: () => void;
  onActivity?: () => void;
  /** Avisa al padre el threadId real cuando se crea en el primer mensaje. */
  onThreadCreated?: (threadId: string) => void;
}

const QUICK_REPLIES = [
  "Hola, ¿están atendiendo?",
  "¿Hacen delivery a mi zona?",
  "¿Qué me recomiendan hoy?",
];

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/** "Hoy" · "Ayer" · "12 may" — separadores de día como WhatsApp. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Hoy";
  if (same(d, yest)) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export default function ChatConversationView({
  threadId: threadIdProp, storeId, storeName, storeSlug, storeLogo,
  customerPhone, customerName, onBack, onActivity, onThreadCreated,
}: Props) {
  const [threadId, setThreadId] = useState<string | null>(threadIdProp);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [loading, setLoading] = useState(!!threadIdProp);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brandon 2026-06-07: si el hilo ya no existe o no es tuyo (GET 404 por
  // ownership / thread borrado, o 403 por sesión que no coincide), marcamos
  // "no disponible" → cortamos el polling (evita el spam de 404 en consola) y
  // deshabilitamos el envío (evita el POST 403).
  const [unavailable, setUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    if (!threadId || !storeSlug) return;
    try {
      const res = await fetch(
        `/api/chat/public?threadId=${encodeURIComponent(threadId)}&storeSlug=${encodeURIComponent(storeSlug)}&customerPhone=${encodeURIComponent(customerPhone)}`,
        { credentials: "include" },
      );
      // Hilo inaccesible (borrado / ownership / sesión) → cortar polling.
      if (res.status === 404 || res.status === 403) { setUnavailable(true); return; }
      if (!res.ok) return;
      const j = (await res.json()) as { data: ThreadMsg[] };
      setMessages(j.data ?? []);
    } catch {
      /* polling no crítico */
    }
  }, [threadId, storeSlug, customerPhone]);

  // Carga inicial + polling "en vivo".
  useEffect(() => {
    if (!threadId || unavailable) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      await fetchMessages();
      if (!cancelled) setLoading(false);
    })();
    const interval = window.setInterval(fetchMessages, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [threadId, fetchMessages, unavailable]);

  // Autoscroll al fondo cuando llegan mensajes nuevos.
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      onActivity?.();
    }
  }, [messages.length, onActivity]);

  const send = async (raw?: string) => {
    const trimmed = (raw ?? text).trim();
    if (!trimmed || sending || !storeSlug || unavailable) return;
    setSending(true);
    setError(null);
    try {
      let res: Response;
      if (!threadId) {
        // Primer mensaje → abre el thread con firstMessage.
        res = await fetch("/api/chat/public?action=open", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            storeSlug,
            customerPhone,
            customerName,
            firstMessage: trimmed,
          }),
        });
      } else {
        res = await fetch("/api/chat/public?action=send", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            threadId,
            storeSlug,
            customerPhone,
            customerName,
            body: trimmed,
          }),
        });
      }
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Muy rápido — esperá un momento."
            : (j?.error ?? "No se pudo enviar. Probá de nuevo."),
        );
        return;
      }
      // action=open devuelve { data: { threadId } }.
      const newThreadId: string | undefined = j?.data?.threadId;
      if (!threadId && newThreadId) {
        setThreadId(newThreadId);
        onThreadCreated?.(newThreadId);
      }
      setText("");
      // Refresca al toque para ver el mensaje persistido (y sus checks).
      window.setTimeout(() => { void fetchMessages(); }, 300);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — tienda + volver + ir a la tienda */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a chats"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
        </button>
        <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          {storeLogo ? (
            <Image src={storeLogo} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
              <StoreIcon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{storeName}</p>
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">
            La tienda responde por acá o WhatsApp
          </p>
        </div>
        {storeSlug && (
          <Link
            href={`/marketplace/${storeSlug}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
            aria-label={`Ir a la tienda ${storeName}`}
          >
            Ver tienda
            <ArrowRight className="h-3 w-3" strokeWidth={2.75} aria-hidden />
          </Link>
        )}
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface-canvas)] px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando mensajes…
          </div>
        ) : messages.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              Escribile a {storeName}
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">
              Preguntá por productos, precios o tu pedido — te responden en vivo.
            </p>
            {/* Quick replies — un tap y arranca la conversación */}
            <div className="mt-4 flex flex-col items-center gap-2">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  disabled={sending}
                  className="rounded-full border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-sm font-bold text-[var(--accent)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white active:scale-95"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
              const mine = m.senderType === "buyer";
              const isSystem = m.senderType === "system";
              const isOrder = m.messageType === "order_link";

              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-2.5 flex items-center justify-center">
                      <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}

                  {isSystem ? (
                    <div className="my-1.5 flex justify-center">
                      <span className="max-w-[85%] rounded-xl bg-[var(--surface-sunken)] px-3 py-1.5 text-center text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                        {m.body}
                      </span>
                    </div>
                  ) : (
                    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl shadow-sm",
                          isOrder && "w-full max-w-[88%]",
                          mine
                            ? "rounded-br-md bg-[var(--accent)] text-white"
                            : "rounded-bl-md border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)]",
                        )}
                      >
                        {/* Tarjeta de pedido — order_link del checkout */}
                        {isOrder && (
                          <div className={cn(
                            "flex items-center gap-2 rounded-t-2xl px-3 py-2",
                            mine ? "bg-white/15" : "bg-[var(--accent-soft)]",
                          )}>
                            <ReceiptText
                              className={cn("h-4 w-4 shrink-0", mine ? "text-white" : "text-[var(--accent)]")}
                              strokeWidth={2.25}
                              aria-hidden
                            />
                            <span className={cn(
                              "text-[length:var(--ts-2xs)] font-black uppercase tracking-wider",
                              mine ? "text-white" : "text-[var(--accent)]",
                            )}>
                              Pedido enviado a la tienda
                            </span>
                          </div>
                        )}
                        <div className="px-3 py-2">
                          <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">
                            {m.body}
                          </p>
                          <p
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                              mine ? "text-white/75" : "text-[var(--text-tertiary)]",
                            )}
                          >
                            {hhmm(m.createdAt)}
                            {/* ✓ enviado · ✓✓ leído por la tienda (estilo WhatsApp) */}
                            {mine && (
                              m.readBySellerAt ? (
                                <CheckCheck
                                  className="h-3.5 w-3.5 text-white"
                                  strokeWidth={3}
                                  aria-label="Leído por la tienda"
                                />
                              ) : (
                                <Check
                                  className="h-3 w-3"
                                  strokeWidth={3}
                                  aria-label="Enviado"
                                />
                              )
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
        {unavailable ? (
          <p role="status" className="px-2 py-2 text-center text-sm font-semibold text-[var(--text-tertiary)]">
            Esta conversación ya no está disponible.
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="mb-1.5 px-1 text-sm font-bold text-[var(--data-error-500)]">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => { setText(e.target.value.slice(0, 1000)); if (error) setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                placeholder={`Escribile a ${storeName}…`}
                aria-label={`Mensaje para ${storeName}`}
                className="block h-12 min-w-0 flex-1 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || sending}
                aria-label="Enviar mensaje"
                className={cn(
                  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                  text.trim() && !sending
                    ? "bg-[var(--accent)] text-white shadow-md hover:brightness-110"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                )}
              >
                {sending
                  ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  : <Send className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
