"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  BotMessageSquare,
  Send,
  X,
  Sparkles,
} from "@buleje/design-system/icons";
import {
  trackAssistantEvent,
} from "@/lib/analytics/assistant-events";

/**
 * BulejeAssistant — widget flotante de chat IA para el PDP.
 *
 * UX:
 *   - FloatingButton bottom-right (z-index 45, por debajo del CartSidebar).
 *   - Click abre un panel lateral derecho con header, historial, sugerencias
 *     y textarea de input.
 *   - Persiste historial en localStorage por productId (assistant-context.tsx
 *     gestiona eso cuando está disponible; si no, fallback inline a localStorage).
 *
 * API: POST /api/assistant/chat con { productId, message, history }
 *
 * Contenido mock por ahora. TODO: integrar Groq AI SDK v6.
 */

export interface BulejeAssistantProduct {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  storeName?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Epoch ms */
  t: number;
}

export interface BulejeAssistantProps {
  product: BulejeAssistantProduct;
  /** Override open state (para integración con PDP). */
  defaultOpen?: boolean;
}

const STORAGE_PREFIX = "buleje-assistant-history-";

function welcomeMessage(name: string): AssistantMessage {
  return {
    id: `welcome-${name.length}`,
    role: "assistant",
    text: `Hola, soy el asistente de Buleje. Puedo ayudarte con preguntas sobre ${name}. ¿Qué quieres saber?`,
    t: 0,
  };
}

const INITIAL_SUGGESTIONS: string[] = [
  "¿Es fresco?",
  "¿Cuándo llega?",
  "¿Tienen descuento?",
  "¿Sirve para ceviche?",
];

export function BulejeAssistant({ product, defaultOpen = false }: BulejeAssistantProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [welcomeMessage(product.name)]);
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}${product.id}`, [product.id]);

  // Hidratar historial desde localStorage al montar o cambiar producto
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as AssistantMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      /* silent */
    }
  }, [storageKey]);

  // Persistir cuando cambian los mensajes (no en el welcome inicial solo)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (messages.length <= 1) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* silent */
    }
  }, [messages, storageKey]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Notificar analytics al abrir
  useEffect(() => {
    if (!open) return;
    trackAssistantEvent({
      type: "assistantOpened",
      productId: product.id,
    });
  }, [open, product.id]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMsg: AssistantMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: trimmed,
        t: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      trackAssistantEvent({
        type: "questionAsked",
        productId: product.id,
        question: trimmed,
      });

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            message: trimmed,
            history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          }),
        });

        if (!res.ok) {
          throw new Error(`assistant API ${res.status}`);
        }

        const json = (await res.json()) as {
          reply: string;
          followUpSuggestions?: string[];
        };

        const replyMsg: AssistantMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: json.reply,
          t: Date.now(),
        };
        setMessages((prev) => [...prev, replyMsg]);
        if (json.followUpSuggestions && json.followUpSuggestions.length > 0) {
          setSuggestions(json.followUpSuggestions);
        }
      } catch {
        const errMsg: AssistantMessage = {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "Disculpá, no pude responder ahora mismo. Intentá de nuevo en un momento.",
          t: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setSending(false);
      }
    },
    [sending, messages, product.id],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleSuggestion = useCallback(
    (q: string) => {
      trackAssistantEvent({
        type: "suggestionClicked",
        productId: product.id,
        suggestion: q,
      });
      sendMessage(q);
    },
    [sendMessage, product.id],
  );

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente Buleje"
        aria-expanded={open}
        className="fixed bottom-24 right-4 sm:right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-3 shadow-xl hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        data-testid="buleje-assistant-button"
      >
        <BotMessageSquare className="h-5 w-5" aria-hidden />
        <span className="hidden sm:inline text-sm font-semibold">Asistente</span>
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success)] animate-pulse"
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            aria-label="Cerrar asistente"
          />

          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            className="fixed right-0 top-0 bottom-0 z-50 flex w-full sm:max-w-md flex-col bg-[var(--surface-canvas)] shadow-2xl border-l border-[var(--rule-muted)]"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-[var(--rule-muted)] bg-[var(--surface-raised)] px-4 py-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="assistant-title"
                  className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)] leading-tight"
                >
                  Asistente Buleje
                </h2>
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate">
                  Preguntale lo que quieras sobre {product.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar asistente"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === "user"
                      ? "flex justify-end"
                      : "flex items-start gap-2"
                  }
                >
                  {msg.role === "assistant" && (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] mt-0.5">
                      <Bot className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <div
                    className={
                      msg.role === "user"
                        ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--text-primary)] px-4 py-2.5 text-[length:var(--ts-sm)] text-[var(--surface-canvas)] leading-relaxed"
                        : "max-w-[80%] rounded-2xl rounded-tl-sm bg-[var(--surface-raised)] border border-[var(--rule-muted)] px-4 py-2.5 text-[length:var(--ts-sm)] text-[var(--text-primary)] leading-relaxed"
                    }
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                    <Bot className="h-4 w-4 animate-pulse" aria-hidden />
                  </span>
                  Escribiendo...
                </div>
              )}
            </div>

            {/* Suggestions + Input */}
            <div className="border-t border-[var(--rule-muted)] bg-[var(--surface-raised)]">
              {suggestions.length > 0 && (
                <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestion(s)}
                      disabled={sending}
                      className="inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Escribí tu pregunta..."
                  aria-label="Escribir pregunta al asistente"
                  rows={1}
                  maxLength={400}
                  className="flex-1 resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-[length:var(--ts-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
                  disabled={sending}
                />
                <button
                  type="submit"
                  aria-label="Enviar pregunta"
                  disabled={!input.trim() || sending}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] transition-opacity disabled:opacity-40 hover:opacity-90"
                >
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              </form>

              <p className="px-4 pb-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                Te respondo en segundos, en lenguaje del barrio.
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
