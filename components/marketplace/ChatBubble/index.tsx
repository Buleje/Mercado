"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, User, Store as StoreIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { usePublicChat } from "./hooks";

interface ChatBubbleProps {
  /** Slug de la tienda del marketplace (requerido) */
  storeSlug: string;
  /** Nombre visible de la tienda (se muestra en el header del chat) */
  storeName: string;
  /** orderId opcional para anclar el hilo a un pedido específico */
  orderId?: string;
  /** Posición del botón flotante */
  position?: "bottom-right" | "bottom-left";
}

/**
 * ChatBubble — widget flotante del storefront para que el buyer hable
 * con el seller (Bloque D2 del Marketplace).
 *
 * UX:
 *   - Botón flotante en la esquina (bottom-right default)
 *   - Al hacer click, abre un panel de chat de ~360x520
 *   - Si no hay sesión: formulario de nombre + teléfono + primer mensaje
 *   - Si hay sesión: vista de conversación con messages + composer
 *   - Persiste threadId + customerPhone en localStorage
 *
 * Consume: /api/chat/public (POST action=open/send, GET con ownership check)
 *
 * Feature-flag: el endpoint devuelve 503 si marketplace-chat-public=false,
 * y el hook lo maneja mostrando el mensaje "Chat temporalmente no disponible".
 */
export default function ChatBubble({
  storeSlug,
  storeName,
  orderId,
  position = "bottom-right",
}: ChatBubbleProps) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const {
    session,
    messages,
    loading,
    error,
    startChat,
    sendMessage,
    clearSession,
  } = usePublicChat(storeSlug);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, open]);

  const unread = messages.filter(
    (m) => m.senderType === "seller" && session !== null,
  ).length;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar chat" : "Abrir chat con la tienda"}
        className={cn(
          "fixed z-[60] flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg transition ring-2 ring-white/40",
          "hover:scale-105 hover:bg-[var(--accent)]/90 focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/30",
          // Posición mobile sube por encima de BottomNav (60px) + sticky
          // cart (~76px) + buffer. Desktop esquina inferior clásica.
          position === "bottom-right"
            ? "bottom-[156px] right-3 sm:bottom-5 sm:right-5"
            : "bottom-[156px] left-3 sm:bottom-5 sm:left-5",
          open && "rotate-90",
        )}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {unread > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[length:var(--ts-2xs)] font-bold"
                aria-label={`${unread} mensajes sin leer`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-[60] flex h-[520px] max-h-[78vh] w-[calc(100vw-1.5rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900",
            position === "bottom-right"
              ? "bottom-[220px] right-3 sm:bottom-24 sm:right-5"
              : "bottom-[220px] left-3 sm:bottom-24 sm:left-5",
          )}
          role="dialog"
          aria-label={`Chat con ${storeName}`}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-[#00B4A6] p-3 text-white dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <StoreIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{storeName}</div>
                <div className="text-[length:var(--ts-2xs)] opacity-80">
                  {session ? "Conversación activa" : "Hablanos"}
                </div>
              </div>
            </div>
            {session && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("¿Cerrar esta sesión de chat? Puedes volver a abrir otra cuando quieras.")) {
                    clearSession();
                  }
                }}
                className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Cerrar sesión"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </header>

          {/* Body */}
          {!session ? (
            <StartForm
              onStart={(data) =>
                startChat({
                  customerName: data.name,
                  customerPhone: data.phone,
                  firstMessage: data.message,
                  orderId,
                  subject: orderId ? `Consulta sobre pedido ${orderId}` : undefined,
                })
              }
              loading={loading}
              error={error}
            />
          ) : (
            <>
              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-950"
                role="log"
                aria-label="Mensajes"
                aria-live="polite"
              >
                {messages.length === 0 && !loading && (
                  <p className="py-8 text-center text-xs text-slate-500">
                    Enviá el primer mensaje para empezar la conversación
                  </p>
                )}
                {messages.map((m) => (
                  <MessageRow key={m.id} msg={m} />
                ))}
              </div>

              {error && (
                <div className="border-t border-red-200 bg-red-50 p-2 text-center text-[length:var(--ts-2xs)] text-red-700 dark:border-red-900 dark:bg-red-950">
                  {error}
                </div>
              )}

              <Composer onSend={sendMessage} disabled={loading} />
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StartForm({
  onStart,
  loading,
  error,
}: {
  onStart: (data: { name: string; phone: string; message: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !message.trim()) return;
    await onStart({ name: name.trim(), phone: phone.trim(), message: message.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 p-4">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Dejanos tu nombre y teléfono para que podamos responderte también por WhatsApp si no estamos en línea.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase text-slate-500">Tu nombre</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={150}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="María"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase text-slate-500">Teléfono (WhatsApp)</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          minLength={6}
          maxLength={20}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="+51 987 654 321"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase text-slate-500">Tu mensaje</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          maxLength={4000}
          rows={3}
          className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="Hola, ¿tienen arroz costeño?"
        />
      </label>

      {error && (
        <div className="rounded-md bg-red-50 p-2 text-[length:var(--ts-2xs)] text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim() || !phone.trim() || !message.trim()}
        className="rounded-lg bg-[#00B4A6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#00B4A6]/90 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        {loading ? "Abriendo chat…" : "Iniciar chat"}
      </button>
    </form>
  );
}

function MessageRow({ msg }: { msg: import("./types").PublicMessageView }) {
  const isBuyer = msg.senderType === "buyer";
  const isSystem = msg.senderType === "system";
  const time = new Date(msg.createdAt).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-slate-200 px-3 py-0.5 text-[length:var(--ts-2xs)] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {msg.body}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2", isBuyer ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white",
          isBuyer ? "bg-slate-400" : "bg-[#00B4A6]",
        )}
      >
        {isBuyer ? <User className="h-3.5 w-3.5" /> : <StoreIcon className="h-3.5 w-3.5" />}
      </div>
      <div className="max-w-[75%]">
        <div
          className={cn(
            "rounded-2xl px-3 py-1.5 text-sm",
            isBuyer
              ? "rounded-br-sm bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
              : "rounded-bl-sm bg-[#00B4A6] text-white",
          )}
        >
          <div className="whitespace-pre-wrap break-words">{msg.body}</div>
        </div>
        <div
          className={cn(
            "mt-0.5 text-[length:var(--ts-2xs)] text-slate-400",
            isBuyer ? "text-right" : "text-left",
          )}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function Composer({
  onSend,
  disabled,
}: {
  onSend: (body: string) => Promise<void>;
  disabled: boolean;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setBody("");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        maxLength={4000}
        disabled={disabled || sending}
        placeholder="Escribí un mensaje…"
        className="flex-1 resize-none rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-[#00B4A6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/20 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900 disabled:opacity-60"
        style={{ minHeight: "36px", maxHeight: "100px" }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || sending || !body.trim()}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00B4A6] text-white transition hover:bg-[#00B4A6]/90 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        aria-label="Enviar"
      >
        <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
      </button>
    </div>
  );
}
