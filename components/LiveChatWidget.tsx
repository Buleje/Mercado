"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { usePathname } from "next/navigation";
import {
  MessageCircle, X, Send, Loader2,
  Clock, Truck, CreditCard, MapPin, ShoppingBag,
  Package, HelpCircle, Bot, User,
  Sparkles,
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
  { icon: Truck, text: "¿Cuánto cuesta el delivery?", color: "text-primary" },
  { icon: Clock, text: "¿Cuáles son los horarios?", color: "text-amber-500" },
  { icon: CreditCard, text: "¿Tienen pago con Yape?", color: "text-violet-500" },
  { icon: Package, text: "¿Cuándo llega mi pedido?", color: "text-emerald-500" },
  { icon: ShoppingBag, text: "Quiero hacer un pedido", color: "text-emerald-500" },
  { icon: HelpCircle, text: "¿Tienen descuentos hoy?", color: "text-pink-500" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex items-center justify-center shadow-xl transition-all duration-300 md:bottom-6",
          open
            ? "w-12 h-12 rounded-full bg-gray-600 hover:bg-gray-700"
            : "h-14 rounded-full bg-linear-to-r from-primary to-teal-500 hover:from-primary/90 hover:to-teal-500/90 text-white px-5 gap-2.5"
        )}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <>
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-bold hidden sm:inline">Chat</span>
          </>
        )}
        {hasUnread && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center animate-bounce">
            !
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden",
            "bottom-36 right-4 w-88 max-h-128 rounded-2xl shadow-2xl border md:bottom-22",
            "bg-white dark:bg-[#0f1117] border-gray-200 dark:border-card-border",
            "animate-[fadeUp_0.3s_ease-out]"
          )}
        >
          {/* Header */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0a3d38 0%, #00B4A6 55%, #00d4c4 100%)" }}
          >
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
            <div className="absolute -bottom-3 -left-6 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative px-4 py-3.5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-extrabold text-white leading-tight">Chatea con el Negocio</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {aiStatus?.hasAI ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[length:var(--ts-2xs)] text-white/70 font-medium">IA activa · {aiStatus.activeProviderName}</span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-[length:var(--ts-2xs)] text-white/70 font-medium">Respuestas automáticas</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors border border-white/20"
                aria-label="Cerrar chat"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-48 max-h-72" style={{ scrollbarWidth: "thin" }}>
            {messages.length === 0 && !botTyping && (
              <div className="text-center mt-4 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">¡Hola{customerName ? `, ${customerName.split(" ")[0]}` : ""}! 👋</p>
                  <p className="text-xs text-muted mt-1">Pregúntame lo que necesites o usa las opciones rápidas</p>
                </div>
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={cn("flex gap-2", m.sender === "customer" ? "justify-end" : "justify-start")}>
                {m.sender !== "customer" && (
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    m.sender === "bot" ? "bg-primary/10" : "bg-secondary/10"
                  )}>
                    {m.sender === "bot"
                      ? <Bot className="h-3.5 w-3.5 text-primary" />
                      : <User className="h-3.5 w-3.5 text-secondary" />}
                  </div>
                )}
                <div className={cn(
                  "max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                  m.sender === "customer"
                    ? "bg-primary text-white rounded-br-md"
                    : m.sender === "bot"
                      ? "bg-gray-100 dark:bg-surface text-foreground rounded-bl-md border border-gray-200 dark:border-card-border"
                      : "bg-secondary/10 text-foreground rounded-bl-md border border-secondary/20"
                )}>
                  <p className="whitespace-pre-line">{m.message}</p>
                  <p className={cn(
                    "text-[length:var(--ts-2xs)] mt-1.5",
                    m.sender === "customer" ? "text-white/60" : "text-muted"
                  )}>
                    {m.sender === "bot" && "🤖 "}
                    {m.sender === "admin" && "👤 Equipo · "}
                    {new Date(m.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {m.sender === "customer" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>
            ))}

            {/* Bot typing indicator */}
            {botTyping && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-surface border border-gray-200 dark:border-card-border">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {messages.length === 0 && (
            <div className="px-3 pb-2 border-t border-gray-100 dark:border-card-border pt-2">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2 px-1">Preguntas frecuentes</p>
              <div className="grid grid-cols-2 gap-1.5">
                {contextProduct && (
                  <button
                    onClick={() => send(`¿Tienen ${contextProduct.name} disponible?`)}
                    className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-foreground bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors text-left"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">¿Tienen {contextProduct.name} disponible?</span>
                  </button>
                )}
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q.text}
                    onClick={() => send(q.text)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[length:var(--ts-2xs)] font-semibold text-foreground bg-gray-50 dark:bg-surface hover:bg-primary/5 border border-gray-100 dark:border-card-border transition-colors text-left"
                  >
                    <q.icon className={cn("h-3.5 w-3.5 shrink-0", q.color)} />
                    <span className="truncate">{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick reply chips when in conversation */}
          {messages.length > 0 && messages.length < 6 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1 border-t border-gray-100 dark:border-card-border pt-2">
              {QUICK_QUESTIONS.slice(0, 3).map(q => (
                <button
                  key={q.text}
                  onClick={() => send(q.text)}
                  className="text-[length:var(--ts-2xs)] font-semibold px-2.5 py-1 rounded-full border border-primary/15 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3 border-t border-gray-200 dark:border-card-border bg-white dark:bg-[#0f1117]"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              maxLength={500}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-surface text-sm outline-none border border-transparent focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className={cn(
                "p-2.5 rounded-xl transition-all",
                input.trim()
                  ? "bg-primary text-white shadow-md shadow-primary/25 hover:bg-primary/90"
                  : "bg-gray-200 dark:bg-surface text-muted"
              )}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>

          {/* Powered by */}
          <div className="px-3 pb-2 flex items-center justify-center">
            <span className="text-[length:var(--ts-2xs)] text-muted/50 font-medium">
              {aiStatus?.hasAI
                ? `✨ IA: ${aiStatus.activeProviderName} · El equipo también responde`
                : "⚠️ Sin API de IA · Solo respuestas automáticas básicas"}
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
