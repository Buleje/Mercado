"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, User, Store as StoreIcon } from "@buleje/design-system/icons";
import { m as motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCustomer } from "@/contexts/customer-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
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

  // Cliente logueado: aprovechamos nombre y telefono del contexto para
  // evitar pedirlos de nuevo en el form de inicio de chat. Si no hay sesion
  // (o no completo perfil), el form pide ambos campos como antes.
  const { customer } = useCustomer();
  const knownName = customer?.name?.trim() ?? "";
  const knownPhone = customer?.phone?.trim() ?? "";
  const hasIdentity = knownName.length > 0 && knownPhone.length > 0;

  const {
    session,
    messages,
    loading,
    error,
    startChat,
    sendMessage,
    clearSession,
  } = usePublicChat(storeSlug);

  // Posicion flexible: si el carrito tiene items, sabemos que el StickyCartBar
  // se esta mostrando por encima del BottomNav — desplazamos la burbuja para
  // que no se monte sobre el bar. Brandon, mayo 14 2026.
  const { itemCount } = useMarketplaceCart();
  const cartBarVisible = itemCount > 0;

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
      {/* Floating button — posicion flexible segun visibilidad del cart bar.
          Mobile: si hay cart bar visible subimos el boton para no chocar.
          Desktop: la esquina inferior clasica (cart bar es lg:hidden, no
          interfiere). La transicion CSS suaviza el cambio. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar chat" : "Abrir chat con la tienda"}
        className={cn(
          "fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-xl ring-2 ring-white/40",
          "hover:scale-105 hover:bg-[var(--accent)]/90 focus:outline-none focus:ring-4 focus:ring-[var(--accent)]/30",
          "transition-[bottom,transform,background-color] duration-300 ease-out",
          // Bottom dinamico SOLO en mobile (lg-): si hay items en el carrito
          // se levanta sobre el StickyCartBar; sino se apoya en BottomNav.
          // En sm+ usamos bottom-5 fijo (sm:bottom-5).
          cartBarVisible ? "bottom-[168px]" : "bottom-[88px]",
          "sm:!bottom-5",
          position === "bottom-right" ? "right-3 sm:right-5" : "left-3 sm:left-5",
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
                className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1.5 text-[length:var(--ts-2xs)] font-bold"
                aria-label={`${unread} mensajes sin leer`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel — bottom sheet mobile / panel lateral desktop */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop mobile only — facilita cerrar tocando fuera y da
                jerarquia visual cuando el sheet ocupa media pantalla. */}
            <motion.div
              key="chat-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-[2px] sm:hidden"
              aria-hidden
            />
            <motion.div
              key="chat-panel"
              // Bottom sheet en mobile: slide-up desde abajo. En sm+ usamos
              // un fade/slide suave porque ya no es full-width.
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className={cn(
                "fixed z-[60] flex flex-col overflow-hidden bg-[var(--surface-canvas)] shadow-2xl",
                // Mobile (default): bottom sheet full-width pegado abajo
                "inset-x-0 bottom-0 h-[88vh] max-h-[680px] rounded-t-3xl border-t-2 border-[var(--accent)]/20",
                // Desktop (sm+): panel lateral compacto como antes
                "sm:inset-auto sm:h-[560px] sm:max-h-[78vh] sm:w-[380px] sm:max-w-[380px] sm:rounded-2xl sm:border-0",
                position === "bottom-right"
                  ? "sm:bottom-24 sm:right-5"
                  : "sm:bottom-24 sm:left-5",
              )}
              role="dialog"
              aria-modal="true"
              aria-label={`Chat con ${storeName}`}
            >
              {/* Drag handle visible solo en mobile (afordancia del bottom sheet) */}
              <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
                <span className="h-1.5 w-12 rounded-full bg-[var(--rule-base)]" aria-hidden />
              </div>

              {/* Header redisenado: avatar grande, info clara, boton cerrar visible */}
              <header className="flex items-center justify-between gap-3 px-4 py-3 sm:py-4 border-b border-[var(--rule-soft)] bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/30">
                    <StoreIcon className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-extrabold leading-tight truncate">{storeName}</p>
                    <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-medium text-white/85 leading-tight">
                      <span aria-hidden className="relative inline-flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-white/80 opacity-70 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      {session ? "Conversación activa" : "Te respondemos en minutos"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {session && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("¿Cerrar esta sesión de chat? Puedes volver a abrir otra cuando quieras.")) {
                          clearSession();
                        }
                      }}
                      className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
                      aria-label="Cerrar sesión"
                      title="Reiniciar conversación"
                    >
                      <Send className="h-4 w-4 rotate-180" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar chat"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </header>

              {/* Body */}
              {!session ? (
                <StartForm
                  defaultName={knownName}
                  defaultPhone={knownPhone}
                  hideIdentityFields={hasIdentity}
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
                  <div
                    ref={scrollRef}
                    className="flex-1 space-y-2 overflow-y-auto bg-[var(--surface-sunken)] p-3"
                    role="log"
                    aria-label="Mensajes"
                    aria-live="polite"
                  >
                    {messages.length === 0 && !loading && (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <Send className="h-5 w-5" strokeWidth={2.25} />
                        </span>
                        <p className="text-sm font-medium text-[var(--text-secondary)] max-w-[16rem]">
                          Envia tu primer mensaje para que la tienda te responda.
                        </p>
                      </div>
                    )}
                    {messages.map((m) => (
                      <MessageRow key={m.id} msg={m} />
                    ))}
                  </div>

                  {error && (
                    <div className="border-t border-[var(--data-error-200,#fecaca)] bg-[var(--data-error-50,#fef2f2)] p-2 text-center text-[length:var(--ts-xs)] font-medium text-[var(--data-error-700,#b91c1c)]">
                      {error}
                    </div>
                  )}

                  <Composer onSend={sendMessage} disabled={loading} />
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function StartForm({
  onStart,
  loading,
  error,
  defaultName = "",
  defaultPhone = "",
  hideIdentityFields = false,
}: {
  onStart: (data: { name: string; phone: string; message: string }) => Promise<void>;
  loading: boolean;
  error: string | null;
  defaultName?: string;
  defaultPhone?: string;
  /** Cliente ya logueado: no mostramos campos de nombre/telefono. */
  hideIdentityFields?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState("");

  // Si llegan defaults nuevos despues del mount (customer se hidrata tarde),
  // sincronizamos para que el submit lleve los datos correctos.
  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
    if (defaultPhone && !phone) setPhone(defaultPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultName, defaultPhone]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !message.trim()) return;
    await onStart({ name: name.trim(), phone: phone.trim(), message: message.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 p-4 bg-[var(--surface-canvas)]">
      {hideIdentityFields ? (
        // Cliente logueado: arranque rapido. Mensaje grande + bienvenida con su nombre.
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <User className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Hola, {defaultName.split(" ")[0] || "vecino"}</p>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
              Escribi tu consulta y la tienda te responde por aca o por WhatsApp.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            Dejanos tu nombre y telefono para que la tienda pueda responderte tambien por WhatsApp si no esta en linea.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Tu nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={150}
              className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="Maria"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Telefono (WhatsApp)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={6}
              maxLength={20}
              className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              placeholder="+51 987 654 321"
            />
          </label>
        </>
      )}

      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Tu mensaje
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          maxLength={4000}
          rows={hideIdentityFields ? 5 : 3}
          autoFocus={hideIdentityFields}
          className="flex-1 resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          placeholder="Hola, tienen arroz costeno?"
        />
      </label>

      {error && (
        <div className="rounded-lg bg-[var(--data-error-50,#fef2f2)] border border-[var(--data-error-200,#fecaca)] p-2.5 text-[length:var(--ts-xs)] font-medium text-[var(--data-error-700,#b91c1c)]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim() || !phone.trim() || !message.trim()}
        className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-extrabold text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-not-allowed disabled:bg-[var(--rule-soft)] disabled:text-[var(--text-tertiary)]"
      >
        {loading ? "Abriendo chat..." : (
          <>
            <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Enviar mensaje
          </>
        )}
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
          isBuyer ? "bg-slate-400" : "bg-[var(--accent)]",
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
              : "rounded-bl-sm bg-[var(--accent-600,var(--accent))] text-white",
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
        className="flex-1 resize-none rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900 disabled:opacity-60"
        style={{ minHeight: "36px", maxHeight: "100px" }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || sending || !body.trim()}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        aria-label="Enviar"
      >
        <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
      </button>
    </div>
  );
}
