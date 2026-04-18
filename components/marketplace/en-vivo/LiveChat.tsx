"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MessageCircle } from "@buleje/design-system/icons";
import type { LiveChatMessage } from "@/lib/mocks/lives.mock";

export interface LiveChatProps {
  initialMessages: LiveChatMessage[];
  /** Host name para indicar en mensajes propios del vendedor. */
  hostName: string;
  /** Si el live está activo; si no, deshabilita input. */
  active?: boolean;
}

const FAUX_MESSAGES = [
  { user: "Marcos V.", text: "Gracias por la oferta" },
  { user: "Pilar D.", text: "A qué hora cierran hoy" },
  { user: "Tito G.", text: "Me parto 2 kg por favor" },
  { user: "Milagros L.", text: "Hay delivery a San Fernando" },
  { user: "Julio R.", text: "Buenísima la transmisión" },
];

/**
 * LiveChat — chat lateral para la transmisión.
 *
 * Mantiene mensajes en estado local. Cada ~8s inyecta un mensaje fake
 * para que el chat se sienta vivo (cuando active=true). Reemplazar por
 * subscripción WebSocket real más adelante.
 */
export function LiveChat({ initialMessages, hostName, active = true }: LiveChatProps) {
  const [messages, setMessages] = useState<LiveChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fakeIdx = useRef(0);

  // Auto-scroll al final cuando llegan mensajes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Inyectar mensajes falsos si está activo
  useEffect(() => {
    if (!active) return;

    const id = setInterval(() => {
      const f = FAUX_MESSAGES[fakeIdx.current % FAUX_MESSAGES.length];
      fakeIdx.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `fake-${Date.now()}`,
          user: f.user,
          text: f.text,
          t: Date.now(),
          role: "viewer",
        },
      ]);
    }, 8000);

    return () => clearInterval(id);
  }, [active]);

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const txt = input.trim();
      if (!txt) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `self-${Date.now()}`,
          user: "Tú",
          text: txt,
          t: Date.now(),
          role: "viewer",
        },
      ]);
      setInput("");
    },
    [input],
  );

  return (
    <div
      className="flex h-full max-h-[560px] min-h-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)]"
      aria-label="Chat de la transmisión en vivo"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--rule-muted)] px-4 py-3">
        <MessageCircle className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
          Chat en vivo
        </span>
        <span className="ml-auto text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {messages.length} mensajes
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span
                className={
                  msg.role === "host"
                    ? "text-[length:var(--ts-xs)] font-bold text-[var(--accent)]"
                    : "text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]"
                }
              >
                {msg.user}
                {msg.role === "host" && (
                  <span className="ml-1 rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    tienda
                  </span>
                )}
              </span>
            </div>
            <p className="text-[length:var(--ts-sm)] text-[var(--text-primary)] leading-snug">
              {msg.text}
            </p>
          </div>
        ))}

        {messages.length === 0 && (
          <p className="text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)] py-8">
            Sé la primera persona en escribir. {hostName} está por conectarse.
          </p>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-[var(--rule-muted)] bg-[var(--surface-canvas)] px-3 py-2.5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={active ? "Escribí tu comentario o pregunta..." : "Chat cerrado"}
          disabled={!active}
          maxLength={240}
          aria-label="Escribir mensaje en el chat"
          className="flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!active || !input.trim()}
          aria-label="Enviar mensaje"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] transition-opacity disabled:opacity-40 hover:opacity-90"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
