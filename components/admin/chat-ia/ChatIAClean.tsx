"use client";

/**
 * ChatIAClean — diseño limpio inspirado en Claude/Linear.
 *
 * Principios:
 *  - Mensajes full-width max-w-3xl centrados.
 *  - User: bubble a la derecha, soft background.
 *  - Assistant: sin bubble, prose grande, avatar circular al lado.
 *  - Input abajo floating, textarea con auto-resize.
 *  - Tipografia 16-17px en body, 15px en meta.
 *  - Zero clutter: quick actions son chips sobrios, no grandes cards.
 *  - Streaming real desde /api/ai-assistant via SSE.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Send,
  Sparkles,
  User,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Package,
  Users,
  BarChart,
  Trash2,
  Loader2,
  Copy,
  Check,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { escapeHtml } from "@/lib/safe-html";
import { csrfHeaders } from "@/lib/csrf-client";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  error?: boolean;
}

interface QuickPrompt {
  icon: React.ElementType;
  label: string;
  prompt: string;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    icon: Lightbulb,
    label: "¿Qué hago hoy?",
    prompt:
      "Analiza mi situación actual y dime las 3 acciones más importantes que debo hacer HOY, en orden de impacto. Explícame con un ejemplo sencillo por qué cada una, y cuánto me puede rendir en soles.",
  },
  {
    icon: AlertTriangle,
    label: "¿Algo urgente?",
    prompt:
      "Revisa stock agotado, pedidos sin atender, facturas vencidas. Solo dime lo CRÍTICO, máximo 3 cosas, con lenguaje simple como si le contaras a un bodeguero nuevo.",
  },
  {
    icon: TrendingUp,
    label: "Estado del negocio",
    prompt:
      "Dame un diagnóstico ejecutivo del estado del negocio: ventas, inventario, clientes. Usa ejemplos simples, define cualquier término técnico entre paréntesis.",
  },
  {
    icon: Package,
    label: "Ideas de productos",
    prompt:
      "¿Qué 3 productos nuevos me recomiendas agregar al catálogo, basándote en mis ventas reales? Explica por qué cada uno con una analogía y dame el precio sugerido con cálculo paso a paso.",
  },
  {
    icon: Users,
    label: "Retener clientes",
    prompt:
      "Dame 3 estrategias para retener a mis clientes top, basadas en sus datos reales de compra. Explica cada una con un ejemplo del día a día de la bodega.",
  },
  {
    icon: BarChart,
    label: "Ventas de hoy",
    prompt:
      "Resume las ventas de hoy vs ayer. Cuántos pedidos, ticket promedio, productos más vendidos. Formato tabla si ayuda.",
  },
];

const STORAGE_KEY = "chat-ia-clean-history";

function loadHistory(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: Message[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
  } catch {
    /* noop */
  }
}

interface ChatIACleanProps {
  tone?: "feynman" | "ejecutivo" | "tecnico";
  model?: "fast" | "balanced" | "smart";
  maxTokens?: number;
}

export default function ChatIAClean({
  tone = "feynman",
  model: _model = "balanced",
  maxTokens: _maxTokens = 1500,
}: ChatIACleanProps) {
  // _model y _maxTokens reservados para futura integración con el endpoint
  // que aún no los consume directamente del cliente.
  void _model;
  void _maxTokens;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate desde localStorage en cliente
  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  // Persistir mensajes
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages);
  }, [messages]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      const assistantId = `a-${Date.now() + 1}`;
      const assistantPlaceholder: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now() + 1,
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setInput("");
      setStreaming(true);

      // Evento para contador de uso del wrapper
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("chat-ia:query", { detail: { message: trimmed } }),
        );
      }

      abortRef.current = new AbortController();

      try {
        const history = messages
          .filter((m) => m.role !== "assistant" || m.content.length > 0)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        // Instruccion del tono: se antepone al mensaje para que el endpoint
        // no requiera cambios de schema. El system prompt del backend ya
        // incluye Feynman; aca solo reforzamos cuando se cambia el tono.
        const tonePrefix =
          tone === "ejecutivo"
            ? "[TONO: ejecutivo — directo, números, sin explicaciones largas] "
            : tone === "tecnico"
              ? "[TONO: técnico — jerga completa, asume audiencia experta] "
              : "";

        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: tonePrefix + trimmed,
            history,
            stream: true,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Error de red" }));
          throw new Error(errBody.error ?? `Error ${res.status}`);
        }

        // SSE streaming
        if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";
          let sawError: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t || !t.startsWith("data: ")) continue;
              const payload = t.slice(6);
              if (payload === "[DONE]") break;
              try {
                const json = JSON.parse(payload) as { content?: string; error?: string };
                if (json.error) {
                  sawError = json.error;
                } else if (json.content) {
                  fullContent += json.content;
                  const captured = fullContent;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, content: captured } : m)),
                  );
                }
              } catch {
                /* skip */
              }
            }
          }

          // Si el stream terminó sin contenido, mostramos error claro.
          // Caso típico: Vercel AI Gateway devuelve 401 (falta AI_GATEWAY_API_KEY).
          if (fullContent.length === 0) {
            const looks401 = typeof sawError === "string" && /401|unauthor|api.?key|invalid.*key/i.test(sawError);
            const errorText = looks401
              ? `**API key del proveedor IA inválida o expirada.**\n\nDetalle: ${sawError}\n\n**Solución:** verificá que \`GROQ_API_KEY\` (o \`ANTHROPIC_API_KEY\` / \`XAI_API_KEY\`) en \`.env.local\` sea la key real del proveedor (Groq ~56 chars, Anthropic ~108 chars, xAI ~84 chars). Si vale solo \`gsk_...\` o similar corto, es un placeholder.`
              : sawError
              ? `**No pude responder:** ${sawError}`
              : `**El asistente está inactivo.** No se recibió respuesta de la IA.\n\nPosibles causas:\n- Falta configurar \`AI_GATEWAY_API_KEY\` o \`GROQ_API_KEY\` en el servidor\n- El servicio de IA externo está temporalmente caído\n- Se agotaron los tokens disponibles del mes\n\nContactá al administrador técnico para revisar la configuración.`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: errorText, error: true } : m,
              ),
            );
          }
        } else {
          // Fallback JSON
          const data = (await res.json()) as { reply?: string; error?: string };
          const content = data.reply ?? "";
          if (!content) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `**No pude responder:** ${data.error ?? "respuesta vacía del servidor"}`,
                      error: true,
                    }
                  : m,
              ),
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content } : m,
              ),
            );
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelado por el usuario
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        } else {
          const msg =
            err instanceof Error ? err.message : "No pude conectarme a la IA.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `**No pude responder:** ${msg}\n\nVerifica tu conexión o intenta de nuevo en un momento.`,
                    error: true,
                  }
                : m,
            ),
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, tone],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      void sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter envia, Shift+Enter nueva linea
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const handleCopy = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* noop */
    }
  }, []);

  const handleClear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, [streaming]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[var(--surface-raised)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState onPick={(p) => void sendMessage(p)} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-8">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={streaming && m.role === "assistant" && m === messages[messages.length - 1]}
                copied={copiedId === m.id}
                onCopy={() => handleCopy(m)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={streaming}
              placeholder={
                streaming
                  ? "Esperando respuesta…"
                  : "Pregunta cualquier cosa sobre tu negocio…"
              }
              className={cn(
                "w-full resize-none rounded-2xl border border-[var(--rule-base)]",
                "bg-[var(--surface-sunken)] dark:bg-surface",
                "px-5 py-4 pr-14 text-base leading-relaxed",
                "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20 focus:border-[var(--text-primary)]/40",
                "transition-all",
                streaming && "opacity-60 cursor-wait",
              )}
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                title="Detener generación"
                className="absolute right-3 bottom-3 h-10 w-10 rounded-xl bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 text-white flex items-center justify-center transition-colors"
                aria-label="Detener"
              >
                <span className="block h-3 w-3 bg-white dark:bg-[var(--color-card)] rounded-sm" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                title="Enviar (Enter)"
                className={cn(
                  "absolute right-3 bottom-3 h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                  input.trim()
                    ? "bg-[var(--text-primary)] text-white hover:opacity-90"
                    : "bg-[var(--rule-soft)] text-[var(--text-tertiary)] cursor-not-allowed",
                )}
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </form>
          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              <kbd className="font-mono text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--rule-soft)]">
                Enter
              </kbd>{" "}
              enviar ·{" "}
              <kbd className="font-mono text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--rule-soft)]">
                Shift+Enter
              </kbd>{" "}
              nueva línea
            </p>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                disabled={streaming}
                className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Borrar conversación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16 sm:py-20 flex flex-col items-center text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] mb-5">
        <Sparkles className="h-7 w-7 text-[color:var(--data-success)]" />
      </span>
      <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight mb-2">
        Asistente de tu negocio
      </h2>
      <p className="text-base text-[var(--text-secondary)] leading-relaxed max-w-xl">
        Te ayudo a entender qué pasa en tu negocio, qué hacer ahora y cómo vender más.
        Respondo con ejemplos fáciles y datos reales — sin adornos.
      </p>

      <div className="mt-10 w-full">
        <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">
          Probá con estas preguntas
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onPick(q.prompt)}
              className={cn(
                "group flex items-start gap-3 p-4 rounded-xl text-left",
                "border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
                "hover:border-[var(--text-primary)]/30 hover:bg-[var(--surface-sunken)]",
                "transition-all",
              )}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] group-hover:bg-white dark:group-hover:bg-[var(--surface-raised)] transition-colors">
                <q.icon className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-primary)] leading-tight">
                  {q.label}
                </span>
                <span className="block text-sm text-[var(--text-tertiary)] leading-snug mt-1 line-clamp-2">
                  {q.prompt}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({
  message,
  isStreaming,
  copied,
  onCopy,
}: {
  message: Message;
  isStreaming: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[var(--text-primary)] text-white px-5 py-3">
          <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 group">
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-1",
          message.error
            ? "bg-[var(--data-error-50)] dark:bg-red-950/30"
            : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
        )}
      >
        <Sparkles
          className={cn(
            "h-4 w-4",
            message.error
              ? "text-[var(--data-error-500)]"
              : "text-[color:var(--data-success)]",
          )}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Asistente IA
          </p>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              escribiendo
            </span>
          )}
        </div>
        {message.content ? (
          <>
            <MarkdownContent text={message.content} />
            {!isStreaming && (
              <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 py-1 rounded-md hover:bg-[var(--surface-sunken)] transition-colors"
                  title="Copiar respuesta"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-[var(--data-success-500)]" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : isStreaming ? (
          <StreamingDots />
        ) : null}
      </div>
    </div>
  );
}

// ── MarkdownContent — renderer minimalista seguro ────────────────────────────

function MarkdownContent({ text }: { text: string }) {
  // Render minimalista inspirado en prose. Soporta:
  // - **bold**
  // - ### headings
  // - - listas
  // - `inline code`
  // Usa escapeHtml antes de aplicar reemplazos para evitar XSS.
  const html = useMemo(() => {
    const escaped = escapeHtml(text);
    // Preservar espacios y procesar por bloques
    const blocks = escaped.split(/\n\n+/);
    return blocks
      .map((block) => {
        // Headings ### / ##
        const hMatch = block.match(/^(#{1,3})\s+(.+)$/m);
        if (hMatch) {
          const level = hMatch[1].length;
          const content = hMatch[2];
          const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          return `<${tag} class="font-extrabold text-[var(--text-primary)] mt-4 mb-2 text-[${level === 1 ? "20px" : level === 2 ? "18px" : "17px"}]">${processInline(content)}</${tag}>`;
        }
        // Lista con - o * al inicio de cada línea
        if (/^\s*[-*]\s+/.test(block)) {
          const items = block
            .split("\n")
            .filter((l) => /^\s*[-*]\s+/.test(l))
            .map((l) => l.replace(/^\s*[-*]\s+/, ""))
            .map((l) => `<li class="text-base leading-relaxed text-[var(--text-primary)]">${processInline(l)}</li>`)
            .join("");
          return `<ul class="space-y-1.5 list-disc pl-5 my-2">${items}</ul>`;
        }
        // Lista numerada
        if (/^\s*\d+\.\s+/.test(block)) {
          const items = block
            .split("\n")
            .filter((l) => /^\s*\d+\.\s+/.test(l))
            .map((l) => l.replace(/^\s*\d+\.\s+/, ""))
            .map((l) => `<li class="text-base leading-relaxed text-[var(--text-primary)]">${processInline(l)}</li>`)
            .join("");
          return `<ol class="space-y-1.5 list-decimal pl-5 my-2">${items}</ol>`;
        }
        // Parrafo
        return `<p class="text-base leading-relaxed text-[var(--text-primary)] my-2 whitespace-pre-wrap">${processInline(block)}</p>`;
      })
      .join("");
  }, [text]);

  return (
    <div
      className="prose-sm max-w-none"
      // safe: text fue escapado antes de concat
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function processInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-extrabold text-[var(--text-primary)]">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="font-mono text-sm bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded border border-[var(--rule-soft)]">$1</code>');
}

// ── StreamingDots ────────────────────────────────────────────────────────────

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 py-2" aria-label="Generando respuesta">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-[var(--text-tertiary)] animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
