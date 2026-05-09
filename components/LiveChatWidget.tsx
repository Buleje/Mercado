"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useCustomer } from "@/contexts/customer-context";
import { usePathname } from "next/navigation";
import {
  MessageCircle, X, Send, Loader2,
  Clock, Truck, CreditCard, MapPin, ShoppingBag,
  Package, HelpCircle, Bot, User,
  Sparkles, AlertTriangle,
} from "@buleje/design-system/icons";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";

function getProductSlug(product: { name: string; id: number }): string {
  return product.name
    .toLowerCase()
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    + `-${product.id}`;
}

type Msg = {
  id: string;
  sender: "customer" | "admin" | "bot";
  message: string;
  createdAt: string;
};

const QUICK_QUESTIONS = [
  { icon: Truck,      text: "¿Cuánto cuesta el delivery?" },
  { icon: Clock,      text: "¿Cuáles son los horarios?" },
  { icon: CreditCard, text: "¿Tienen pago con Yape?" },
  { icon: Package,    text: "¿Cuándo llega mi pedido?" },
  { icon: ShoppingBag, text: "Quiero hacer un pedido" },
  { icon: HelpCircle, text: "¿Tienen descuentos hoy?" },
];

export default function LiveChatWidget() {
  const { customer } = useCustomer();
  const phone = customer?.phone;
  const customerName = customer?.name;
  const pathname = usePathname();
  const { products } = useStoreProducts();

  // Detect current product page for context-aware chip
  const contextProduct = useMemo(() => {
    const match = pathname.match(/^\/tienda\/([^/]+)$/);
    if (!match) return null;
    const slug = match[1];
    return products.find(p => getProductSlug(p) === slug) ?? null;
  }, [pathname, products]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ hasAI: boolean; activeProviderName: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/chat?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data: Msg[] = await res.json();
      setMessages(prev => {
        // Merge server messages with local bot messages
        const botMsgs = prev.filter(m => m.sender === "bot");
        const serverIds = new Set(data.map(m => m.id));
        const uniqueBotMsgs = botMsgs.filter(m => !serverIds.has(m.id));
        return [...data, ...uniqueBotMsgs].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
    } catch { /* ignore */ }
  }, [phone]);

  // Derive unread status
  const lastAdminTs = messages.filter(m => m.sender === "admin").pop()?.createdAt;
  const lastSeen = typeof window !== "undefined" ? sessionStorage.getItem("buleje-chat-seen") : null;
  const derivedUnread = !open && !!lastAdminTs && lastAdminTs !== lastSeen;

  useEffect(() => {
    setHasUnread(derivedUnread);
  }, [derivedUnread]);

  useEffect(() => {
    if (!phone) return;
    let mounted = true;
    (async () => { if (mounted) await fetchMessages(); })();
    intervalRef.current = setInterval(fetchMessages, 15000);
    return () => { mounted = false; if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phone, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, botTyping]);

  useEffect(() => {
    if (open && lastAdminTs) {
      sessionStorage.setItem("buleje-chat-seen", lastAdminTs);
    }
  }, [open, lastAdminTs]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Fetch AI status on mount
  useEffect(() => {
    fetch("/api/ai/status")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAiStatus({ hasAI: data.hasAI, activeProviderName: data.activeProviderName }); })
      .catch(() => {});
  }, []);

  const getAutoReply = async (message: string): Promise<{ reply: string; type: "auto" | "fallback" }> => {
    try {
      const res = await fetch("/api/chat/auto-reply", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return { reply: "Hubo un error al procesar tu consulta. Intenta de nuevo.", type: "fallback" };
    }
  };

  const send = async (overrideMessage?: string) => {
    const msg = overrideMessage ?? input.trim();
    if (!msg || !phone || sending) return;
    setSending(true);

    const customerMsg: Msg = {
      id: `local-${Date.now()}`,
      sender: "customer",
      message: msg,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, customerMsg]);
    setInput("");

    try {
      // Save customer message to server
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone, name: customerName || "Cliente", message: msg }),
      });
      if (res.ok) {
        const saved: Msg = await res.json();
        setMessages(prev => prev.map(m => m.id === customerMsg.id ? saved : m));
      }
    } catch { /* ignore */ }

    setSending(false);

    // Get auto-reply from bot
    setBotTyping(true);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
    const { reply, type } = await getAutoReply(msg);
    setBotTyping(false);

    const botMsg: Msg = {
      id: `bot-${Date.now()}`,
      sender: "bot",
      message: reply,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, botMsg]);

    // If bot couldn't answer, log it so admin sees it needs attention
    if (type === "fallback") {
      fetch("/api/chat", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          phone: "sistema",
          name: "Bot",
          message: `⚠️ Cliente ${customerName || phone} preguntó algo que no pude responder: "${msg}"`,
        }),
      }).catch(() => {});
    }
  };

  if (!phone) return null;

  return (
    <>
      {/* Floating button — solo visible cuando el chat está cerrado.
          Mismo nivel vertical que Repetir pedido y WhatsApp (bottom-6).
          Posicionado a la izquierda de WhatsApp con gap horizontal. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-24 sm:right-28 z-50 h-14 rounded-full px-5 gap-2.5 flex items-center justify-center transition-all duration-300 active:scale-95"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
            color: "white",
            boxShadow:
              "0 12px 28px -6px color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
          }}
          aria-label="Abrir chat"
        >
          <MessageCircle className="w-6 h-6" strokeWidth={2.25} />
          <span className="text-base font-extrabold hidden sm:inline">Chat</span>
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--data-error-500)] text-white text-xs font-bold flex items-center justify-center animate-bounce">
              !
            </span>
          )}
        </button>
      )}

      {/* Chat window — abre desde bottom-right donde estaba el botón */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden",
            "bottom-24 right-4 sm:right-6 md:bottom-6 md:right-24 w-[92vw] sm:w-[420px] max-h-[640px] rounded-3xl",
            "dark:bg-[#0f1117] animate-[fadeUp_0.3s_ease-out]",
          )}
          style={{
            background: "var(--color-card)",
            border:
              "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
            boxShadow:
              "0 32px 64px -16px color-mix(in oklch, var(--color-primary, #00B4A6) 30%, transparent), 0 8px 16px rgba(0,0,0,0.10)",
          }}
        >
          {/* Header brand */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00B4A6) 100%)",
            }}
          >
            <div
              className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.10)" }}
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-4 -left-8 w-24 h-24 rounded-full pointer-events-none"
              style={{ background: "rgba(255,255,255,0.07)" }}
              aria-hidden="true"
            />
            <div className="relative px-5 py-4 flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/25">
                <Sparkles className="h-6 w-6 text-white" strokeWidth={2.25} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-extrabold text-white leading-tight">
                  Chatea con el negocio
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  {aiStatus?.hasAI ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      <span className="text-xs text-white/85 font-semibold">
                        IA activa · {aiStatus.activeProviderName}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-white/60" />
                      <span className="text-xs text-white/85 font-semibold">
                        Respuestas automáticas
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-2xl bg-white/15 hover:bg-white/25 transition-colors border border-white/25"
                aria-label="Cerrar chat"
              >
                <X className="h-5 w-5 text-white" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 min-h-64 max-h-[400px]"
            style={{ scrollbarWidth: "thin" }}
          >
            {messages.length === 0 && !botTyping && (
              <div className="text-center mt-6 space-y-3">
                <div
                  className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                    boxShadow:
                      "0 8px 20px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
                  }}
                >
                  <Bot className="h-8 w-8 text-white" strokeWidth={2} />
                </div>
                <div>
                  <p
                    className="text-lg font-extrabold"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    ¡Hola{customerName ? `, ${customerName.split(" ")[0]}` : ""}!
                  </p>
                  <p className="text-sm text-muted mt-1 max-w-xs mx-auto leading-snug">
                    Pregúntame lo que necesites o usa las opciones rápidas
                  </p>
                </div>
              </div>
            )}

            {messages.map(m => (
              <div
                key={m.id}
                className={cn(
                  "flex gap-2.5",
                  m.sender === "customer" ? "justify-end" : "justify-start",
                )}
              >
                {m.sender !== "customer" && (
                  <div
                    className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                    style={
                      m.sender === "bot"
                        ? {
                            background:
                              "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                          }
                        : {
                            background:
                              "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
                          }
                    }
                  >
                    {m.sender === "bot" ? (
                      <Bot className="h-4 w-4 text-white" strokeWidth={2.25} />
                    ) : (
                      <User
                        className="h-4 w-4"
                        strokeWidth={2.25}
                        style={{ color: "var(--color-primary-dark, #009690)" }}
                      />
                    )}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  )}
                  style={
                    m.sender === "customer"
                      ? {
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                          color: "white",
                          borderBottomRightRadius: "0.5rem",
                        }
                      : m.sender === "bot"
                        ? {
                            background: "var(--surface-sunken)",
                            color: "var(--color-foreground)",
                            borderBottomLeftRadius: "0.5rem",
                            border:
                              "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                          }
                        : {
                            background:
                              "color-mix(in oklch, var(--color-primary, #00B4A6) 6%, var(--color-card))",
                            color: "var(--color-foreground)",
                            borderBottomLeftRadius: "0.5rem",
                            border:
                              "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                          }
                  }
                >
                  <p className="whitespace-pre-line">{m.message}</p>
                  <p
                    className={cn(
                      "text-xs mt-1.5 inline-flex items-center gap-1",
                      m.sender === "customer" ? "text-white/70" : "text-muted",
                    )}
                  >
                    {m.sender === "bot" && (
                      <Bot className="h-3 w-3" strokeWidth={2.5} />
                    )}
                    {m.sender === "admin" && (
                      <>
                        <User className="h-3 w-3" strokeWidth={2.5} />
                        <span>Equipo</span>
                        <span>·</span>
                      </>
                    )}
                    <span className="tabular-nums">
                      {new Date(m.createdAt).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                </div>
                {m.sender === "customer" && (
                  <div
                    className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                    }}
                  >
                    <User
                      className="h-4 w-4"
                      strokeWidth={2.25}
                      style={{ color: "var(--color-primary-dark, #009690)" }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Bot typing indicator */}
            {botTyping && (
              <div className="flex gap-2.5 justify-start">
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                  }}
                >
                  <Bot className="h-4 w-4 text-white" strokeWidth={2.25} />
                </div>
                <div
                  className="px-5 py-4 rounded-2xl"
                  style={{
                    background: "var(--surface-sunken)",
                    border:
                      "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                    borderBottomLeftRadius: "0.5rem",
                  }}
                >
                  <div className="flex gap-1.5 items-center">
                    <span
                      className="w-2 h-2 rounded-full animate-bounce [animation-delay:0ms]"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
                      }}
                    />
                    <span
                      className="w-2 h-2 rounded-full animate-bounce [animation-delay:150ms]"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
                      }}
                    />
                    <span
                      className="w-2 h-2 rounded-full animate-bounce [animation-delay:300ms]"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00B4A6) 50%, transparent)",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {messages.length === 0 && (
            <div
              className="px-4 pb-3 pt-3"
              style={{
                borderTop:
                  "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
              }}
            >
              <p
                className="text-xs font-extrabold uppercase tracking-wider mb-2.5 px-1"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                Preguntas frecuentes
              </p>
              <div className="grid grid-cols-2 gap-2">
                {contextProduct && (
                  <button
                    onClick={() => send(`¿Tienen ${contextProduct.name} disponible?`)}
                    className="col-span-2 flex items-center gap-2 px-3 h-11 rounded-xl text-sm font-bold text-foreground transition-colors text-left"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, transparent)",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                    }}
                  >
                    <MapPin
                      className="h-4 w-4 shrink-0"
                      strokeWidth={2.25}
                      style={{ color: "var(--color-primary-dark, #009690)" }}
                    />
                    <span className="truncate">
                      ¿Tienen {contextProduct.name} disponible?
                    </span>
                  </button>
                )}
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q.text}
                    onClick={() => send(q.text)}
                    className="flex items-center gap-2 px-3 h-11 rounded-xl text-sm font-semibold text-foreground transition-colors text-left hover:bg-[var(--surface-sunken)]/60"
                    style={{
                      background: "var(--color-card)",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                    }}
                  >
                    <q.icon
                      className="h-4 w-4 shrink-0"
                      strokeWidth={2.25}
                      style={{ color: "var(--color-primary-dark, #009690)" }}
                    />
                    <span className="truncate">{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick reply chips when in conversation */}
          {messages.length > 0 && messages.length < 6 && (
            <div
              className="px-4 pb-2 flex flex-wrap gap-1.5 pt-3"
              style={{
                borderTop:
                  "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
              }}
            >
              {QUICK_QUESTIONS.slice(0, 3).map(q => (
                <button
                  key={q.text}
                  onClick={() => send(q.text)}
                  className="text-xs font-extrabold px-3 h-8 rounded-full transition-colors inline-flex items-center"
                  style={{
                    background:
                      "color-mix(in oklch, var(--color-primary, #00B4A6) 8%, transparent)",
                    color: "var(--color-primary-dark, #009690)",
                    border:
                      "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
                  }}
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={e => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 p-3 dark:bg-[#0f1117]"
            style={{
              background: "var(--color-card)",
              borderTop:
                "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              maxLength={500}
              className="flex-1 h-12 px-4 rounded-2xl text-sm outline-none transition-all placeholder:text-muted text-foreground"
              style={{
                background: "var(--surface-sunken)",
                border:
                  "2px solid color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
              }}
              onFocus={e =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary, #00B4A6)")
              }
              onBlur={e =>
                (e.currentTarget.style.borderColor =
                  "color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)")
              }
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="h-12 w-12 inline-flex items-center justify-center rounded-2xl transition-all disabled:opacity-50 active:scale-95"
              style={
                input.trim()
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                      color: "white",
                      boxShadow:
                        "0 6px 16px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
                    }
                  : {
                      background: "var(--surface-sunken)",
                      color: "var(--color-muted)",
                    }
              }
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" strokeWidth={2.25} />
              )}
            </button>
          </form>

          {/* Powered by */}
          <div className="px-3 pb-2 flex items-center justify-center">
            <span className="text-[length:var(--ts-2xs)] text-muted/50 font-medium inline-flex items-center gap-1">
              {aiStatus?.hasAI ? (
                <>
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                  {`IA: ${aiStatus.activeProviderName} · El equipo también responde`}
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  Sin API de IA · Solo respuestas automáticas básicas
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Animation keyframe */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
