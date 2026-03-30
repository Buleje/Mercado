"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { products, getProductSlug } from "@/data/products";

type Msg = { id: string; sender: "customer" | "admin"; message: string; createdAt: string };

export default function LiveChatWidget() {
  const { customer } = useCustomer();
  const phone = customer?.phone;
  const customerName = customer?.name;
  const pathname = usePathname();

  // Detect current product page for context-aware chip
  const contextProduct = useMemo(() => {
    const match = pathname.match(/^\/tienda\/([^/]+)$/);
    if (!match) return null;
    const slug = match[1];
    return products.find(p => getProductSlug(p) === slug) ?? null;
  }, [pathname]);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/chat?phone=${phone}`);
      if (!res.ok) return;
      const data: Msg[] = await res.json();
      setMessages(data);
    } catch { /* ignore */ }
  }, [phone]);

  // Derive unread status without setState in effect
  const lastAdminTs = messages.filter(m => m.sender === "admin").pop()?.createdAt;
  const lastSeen = typeof window !== "undefined" ? sessionStorage.getItem("bsm-chat-seen") : null;
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
  }, [messages, open]);

  useEffect(() => {
    if (open && lastAdminTs) {
      sessionStorage.setItem("bsm-chat-seen", lastAdminTs);
    }
  }, [open, lastAdminTs]);

  const send = async () => {
    if (!input.trim() || !phone || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: customerName || "Cliente", message: input.trim() }),
      });
      if (res.ok) {
        const msg: Msg = await res.json();
        setMessages(prev => [...prev, msg]);
        setInput("");
      }
    } catch { /* ignore */ }
    setSending(false);
  };

  if (!phone) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center hover:bg-green-700 transition-colors md:bottom-6"
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {hasUnread && !open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 animate-pulse" />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 w-80 max-h-112 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 flex flex-col md:bottom-22">
          {/* Header */}
          <div className="px-4 py-3 bg-green-600 text-white rounded-t-2xl flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            <div>
              <p className="font-semibold text-sm">Chat con Buleje</p>
              <p className="text-xs opacity-80">Responderemos pronto</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-48 max-h-72">
            {messages.length === 0 && (
              <div className="text-center mt-6 space-y-1">
                <p className="text-zinc-400 text-sm">¡Hola! ¿En qué te podemos ayudar?</p>
                <p className="text-zinc-300 dark:text-zinc-600 text-xs">Usa las opciones rápidas ↓</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] px-3 py-2 rounded-xl text-sm ${
                  m.sender === "customer"
                    ? "bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                }`}>
                  <p>{m.message}</p>
                  <p className="text-[10px] opacity-50 mt-1">
                    {new Date(m.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Quick replies */}
          <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2">
            {[
              ...(contextProduct ? [`¿Tienen ${contextProduct.name} disponible?`] : []),
              "¿Cuánto cuesta el delivery?",
              "¿Cuáles son los horarios?",
              "¿Tienen pago con Yape?",
              "¿Cuándo llega mi pedido?",
              "Quiero hacer un pedido",
              "¿Tienen descuentos hoy?",
            ].map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); }}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3 border-t border-zinc-200 dark:border-zinc-700"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              maxLength={500}
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="p-2 rounded-lg bg-green-600 text-white disabled:opacity-40 hover:bg-green-700 transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
