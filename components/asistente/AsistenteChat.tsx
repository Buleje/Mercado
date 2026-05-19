"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  ShoppingBag,
} from "@buleje/design-system/icons";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
}

interface ProductCard {
  name: string;
  storeName: string;
  storeSlug: string;
  price: number;
  image: string | null;
}

const SUGGESTIONS = [
  "¿Tienen paiche fresco?",
  "Recomendame algo para parrilla",
  "¿Cuánto demora el delivery a Yarinacocha?",
  "¿Aceptan Yape?",
];

const STORAGE_KEY = "asistente-chat-history";

function uid(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Read csrf-token cookie for double-submit protection (lib/csrf.ts). */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

const PEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function AsistenteChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore history from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-20));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on every change (last 20)
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setPending(true);
      setError(null);

      try {
        const csrf = getCsrfToken();
        const res = await fetch("/api/asistente/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(csrf && { "x-csrf-token": csrf }),
          },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          products?: ProductCard[];
          error?: string;
        };

        if (!res.ok || !data.reply) {
          setError(data.error ?? "No pude generar respuesta. Probá de nuevo.");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.reply!,
            products: data.products ?? [],
          },
        ]);
      } catch {
        setError("Error de red. Verificá tu conexión y probá de nuevo.");
      } finally {
        setPending(false);
        // Keep focus on input after send
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [messages, pending],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] max-h-[720px] rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden shadow-[var(--shadow-md)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
            <Bot className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              Asistente Buleje
            </p>
            <p className="text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)] flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
              IA conectada al marketplace
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Limpiar
          </button>
        )}
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4"
      >
        {messages.length === 0 && (
          <EmptyState onPick={(text) => void send(text)} />
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {pending && (
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
              <Bot className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[var(--surface-sunken)] text-sm font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pensando…
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-[var(--data-error-500)] font-semibold px-3 py-2 rounded-lg bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/20">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-3 sm:px-4 sm:py-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Escribí lo que necesitas… (Enter para enviar)"
            className="flex-1 resize-none min-h-[44px] max-h-32 rounded-xl border-2 border-[var(--rule-soft)] focus:border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-2.5 text-sm outline-none transition-colors"
            disabled={pending}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label="Enviar"
            className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)] text-center">
          La IA puede equivocarse. Confirmá precios y stock con la tienda antes de pagar.
        </p>
      </form>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[var(--accent)]/12 text-[var(--accent)] mb-4">
        <Sparkles className="h-7 w-7" strokeWidth={2} />
      </div>
      <h3 className="text-lg font-extrabold text-[var(--text-primary)]">
        Hola, soy tu asistente
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xs">
        Preguntame sobre productos, precios, delivery o tiendas del marketplace.
      </p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-sm font-medium text-[var(--text-secondary)] px-3.5 py-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-raised)] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
          <Bot className="h-4 w-4" strokeWidth={2} />
        </div>
      )}
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-[var(--text-primary)] text-[var(--surface-raised)] rounded-br-sm"
            : "bg-[var(--surface-sunken)] text-[var(--text-primary)] rounded-bl-sm",
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

        {/* Product cards (only on assistant messages) */}
        {!isUser && message.products && message.products.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.products.slice(0, 3).map((p, i) => (
              <Link
                key={`${p.storeSlug}-${i}`}
                href={`/marketplace/${p.storeSlug}`}
                className="flex items-center gap-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] hover:border-[var(--accent)]/40 px-3 py-2 transition-colors"
              >
                {p.image ? (
                  // Use plain <img> here — the URLs come from external CDNs and may
                  // not be in next.config images domains. Worth a follow-up upgrade.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-12 w-12 rounded-lg object-cover bg-[var(--surface-sunken)] shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-[var(--surface-sunken)] inline-flex items-center justify-center shrink-0">
                    <ShoppingBag className="h-5 w-5 text-[var(--text-tertiary)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {p.name}
                  </p>
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)] truncate">
                    {p.storeName}
                  </p>
                </div>
                <span className="text-sm font-extrabold text-[var(--accent)] tabular-nums shrink-0">
                  {PEN(p.price)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
