"use client";

/**
 * BulejeAssistantChat — Chatbot flotante 24/7 del marketplace.
 *
 * Flow:
 *   1. FAB botón chat bottom-right (Sparkles)
 *   2. Click → abre drawer lateral con chat
 *   3. Chips iniciales con preguntas comunes para romper hielo
 *   4. Input con envío + respuesta desde /api/buleje-assistant
 *   5. Persistencia en localStorage (reanuda conversación al reabrir)
 *
 * MVP sin streaming — generateText directo. Podemos migrar a streaming
 * cuando instalemos @ai-sdk/react + actualicemos al protocolo streams.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  MessageCircle,
  Sparkles,
  Send,
  X,
  Loader2,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "buleje-assistant-messages-v1";

const SUGGESTION_CHIPS = [
  "¿Cómo funciona el delivery?",
  "¿Qué cocino con S/30?",
  "¿Tienen ofertas hoy?",
  "¿Cómo pago con Yape?",
] as const;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function BulejeAssistantChat({ hideFab = false }: { hideFab?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistencia — carga al montar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      /* silent */
    }
  }, []);

  // Brandon 2026-06-12: el botón "Ayuda" del nav abre el asistente vía evento
  // global (sin FAB flotante). Cualquier "Ayuda" del marketplace lo dispara.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const openHandler = () => setOpen(true);
    window.addEventListener("buleje:open-assistant", openHandler);
    return () => window.removeEventListener("buleje:open-assistant", openHandler);
  }, []);

  // Persistencia — guarda al cambiar
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* silent */
    }
  }, [messages]);

  // Autoscroll al final cuando llegan mensajes
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, status]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "sending") return;
      setError(null);
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setStatus("sending");
      try {
        const res = await fetch("/api/buleje-assistant", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.reply) {
          setError(data.error ?? "No pudimos responder, intentá de nuevo");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: data.reply,
            },
          ]);
        }
      } catch {
        setError("Error de conexión. Intentá de nuevo.");
      } finally {
        setStatus("idle");
      }
    },
    [messages, status],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSend(input);
    },
    [handleSend, input],
  );

  const handleChipClick = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* silent */
    }
  }, []);

  const isSending = status === "sending";

  return (
    <>
      {/* FAB — botón flotante.
          Brandon 2026-05-20 v8: `hidden md:inline-flex` — en mobile compite
          con el BottomNav fijo + sticky cart bar. En mobile el cliente ya
          tiene chat por WhatsApp en el menú, no necesita un 3er botón
          flotante encima. Desktop sí lo mantiene (más real-estate). */}
      {!open && !hideFab && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente Buleje"
          className="hidden md:inline-flex fixed bottom-6 right-6 z-40 items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-3 shadow-lg hover:bg-[var(--accent)] transition-colors active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-bold">Buleje IA</span>
        </button>
      )}

      {/* Drawer — chat panel */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:inset-auto md:bottom-6 md:right-6 md:h-[600px] md:w-[400px] md:rounded-2xl overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-2xl flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Asistente Buleje"
        >
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
                  Buleje IA
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  Asistente 24/7
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Limpiar conversación"
                  className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                >
                  Limpiar
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </header>

          {/* Mensajes */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[var(--surface-canvas)]"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center py-8">
                <MessageCircle
                  className="h-10 w-10 text-[var(--text-tertiary)] mb-3"
                  strokeWidth={1.25}
                  aria-hidden
                />
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Hola, soy Buleje IA
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1 mb-5 max-w-xs">
                  Te ayudo con productos, recetas, delivery y cualquier duda
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                      : "bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-primary)]",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl px-3.5 py-2.5 inline-flex items-center gap-2">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Buleje IA está pensando…
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error,_#e11d48)]/40 bg-[var(--data-error,_#e11d48)]/10 px-3 py-2 text-xs text-[var(--data-error,_#e11d48)]">
                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <p>{error}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="px-4 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribí tu pregunta…"
                disabled={isSending}
                className="flex-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                aria-label="Enviar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors active:scale-[0.95] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
