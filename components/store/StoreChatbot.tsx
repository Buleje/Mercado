"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
}

// ── Static bot responses ───────────────────────────────────────────────────────

const HORARIO =
  "Atendemos de lunes a sabado de 7:00 am a 9:00 pm, y domingos de 8:00 am a 2:00 pm.";

const DELIVERY =
  "Hacemos delivery en Pucallpa y zonas cercanas. El costo es S/ 3 dentro de la ciudad. Pedidos mayores a S/ 50 tienen delivery gratis.";

const DEFAULT_RESPONSE =
  "Por el momento no tenemos esa informacion disponible aqui. Escribenos por WhatsApp para atencion personalizada.";

function makeId() {
  return Math.random().toString(36).slice(2);
}

function botMessage(text: string): ChatMessage {
  return { id: makeId(), role: "bot", text, timestamp: Date.now() };
}

// ── Keyword matching ───────────────────────────────────────────────────────────

async function resolveResponse(input: string): Promise<string> {
  const q = input.toLowerCase().trim();

  if (q.includes("horario") || q.includes("atienden") || q.includes("hora")) {
    return HORARIO;
  }

  if (
    q.includes("delivery") ||
    q.includes("envio") ||
    q.includes("despacho") ||
    q.includes("mandan") ||
    q.includes("traen")
  ) {
    return DELIVERY;
  }

  // Order status: "pedido 1234" or "orden 1234"
  const orderMatch = q.match(/(?:pedido|orden)\s+(\w+)/);
  if (orderMatch) {
    const orderId = orderMatch[1];
    try {
      const res = await fetch(`/api/orders/${orderId}/public`);
      if (res.ok) {
        const data = await res.json();
        const status: string = data?.status ?? data?.estado ?? "en proceso";
        return `Tu pedido #${orderId} esta actualmente en estado: "${status}".`;
      }
    } catch {
      // ignore
    }
    return `No encontramos el pedido #${orderId}. Verifica el numero o escribenos por WhatsApp.`;
  }

  // Price query: "precio de arroz" / "cuanto cuesta aceite"
  const priceMatch = q.match(
    /(?:precio|cuesta|vale|cuanto)\s+(?:de|del|el|la|un|una|los|las)?\s*(.+)/
  );
  if (priceMatch || q.includes("precio")) {
    const product = priceMatch ? priceMatch[1].trim() : q.replace("precio", "").trim();
    if (product) {
      try {
        const res = await fetch(
          `/api/product-search?q=${encodeURIComponent(product)}&limit=1`
        );
        if (res.ok) {
          const data = await res.json();
          const results = Array.isArray(data) ? data : data?.products ?? [];
          if (results.length > 0) {
            const p = results[0];
            const price = typeof p.price === "number" ? `S/ ${p.price.toFixed(2)}` : "precio no disponible";
            return `${p.name}: ${price} por ${p.unit ?? "unidad"}.`;
          }
        }
      } catch {
        // ignore
      }
      return `No encontramos "${product}" en nuestro catalogo. Escribenos por WhatsApp y te ayudamos.`;
    }
  }

  return DEFAULT_RESPONSE;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoreChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    botMessage("Hola, soy el asistente de Buleje. Puedo ayudarte con precios, horarios, delivery o estado de tu pedido."),
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = { id: makeId(), role: "user", text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const response = await resolveResponse(text);

    setTyping(false);
    setMessages((prev) => [...prev, botMessage(response)]);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
        className={cn(
          "fixed bottom-6 left-6 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-[#0f766e] text-white hover:bg-[#0d5f58] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/50"
        )}
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-22 left-6 z-50 flex flex-col",
            "w-80 max-h-[480px] rounded-xl border border-border bg-card dark:bg-card shadow-2xl overflow-hidden"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-[#0f766e] px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-white" />
              <span className="text-sm font-semibold text-white">
                Asistente de la Bodega
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-background dark:bg-background">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#0f766e] text-white rounded-br-sm"
                      : "bg-muted dark:bg-muted/60 text-foreground dark:text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="bg-muted dark:bg-muted/60 rounded-2xl rounded-bl-sm px-3 py-2">
                  <span className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-border bg-card dark:bg-card px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta..."
              disabled={typing}
              className={cn(
                "flex-1 rounded-md border border-border bg-background dark:bg-background",
                "text-sm text-foreground dark:text-foreground placeholder:text-muted-foreground",
                "px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0f766e]/50 disabled:opacity-50"
              )}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || typing}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                "bg-[#0f766e] text-white hover:bg-[#0d5f58] disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
