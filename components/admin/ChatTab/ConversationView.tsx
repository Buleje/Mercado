"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bot, User, Settings2, Undo2, ShoppingCart, Wallet } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { parseSharedProduct, parseSubstitution, parseChatOrder, parseChatPayment, fmtSoles } from "@/lib/chat/shared-product";
import type { ChatMessageView } from "./types";
import type { MsgReplySnapshot } from "./hooks";

interface ConversationViewProps {
  messages: ChatMessageView[];
  loading: boolean;
  emptyState?: string;
  /** Increment 2b: el vendedor reacciona a un mensaje. */
  onReact?: (messageId: string, emoji: string) => void;
  /** Increment 2b: el vendedor cita un mensaje para responder. */
  onReply?: (snapshot: MsgReplySnapshot) => void;
}

// Increment 2b: reacciones rápidas (mismo set que el lado cliente).
const REACTION_EMOJIS = ["❤️", "👍", "😂", "🔥", "🙏", "😮"];

interface MetaReaction { emoji: string; by: string }
interface MetaReply { id: string; body: string; senderType: string; senderName: string }
function parseMeta(raw: string | null): { reactions: MetaReaction[]; replyTo: MetaReply | null; autoReply: boolean } {
  if (!raw) return { reactions: [], replyTo: null, autoReply: false };
  try {
    const m = JSON.parse(raw) as { reactions?: MetaReaction[]; replyTo?: MetaReply; autoReply?: boolean };
    return {
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      replyTo: m.replyTo ?? null,
      autoReply: m.autoReply === true,
    };
  } catch {
    return { reactions: [], replyTo: null, autoReply: false };
  }
}

export function ConversationView({
  messages,
  loading,
  emptyState = "Seleccioná una conversación para verla",
  onReact,
  onReply,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);

  // Auto-scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Cargando mensajes…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <Bot className="h-12 w-12 text-slate-300" />
        <p className="text-sm text-slate-500">{emptyState}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex h-full flex-col gap-3 overflow-y-auto p-4"
      role="log"
      aria-label="Mensajes de la conversación"
      aria-live="polite"
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          active={activeMsgId === msg.id}
          onToggle={() => setActiveMsgId((id) => (id === msg.id ? null : msg.id))}
          onReact={onReact}
          onReply={(snap) => { onReply?.(snap); setActiveMsgId(null); }}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  active,
  onToggle,
  onReact,
  onReply,
}: {
  message: ChatMessageView;
  active: boolean;
  onToggle: () => void;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (snapshot: MsgReplySnapshot) => void;
}) {
  const isSeller = message.senderType === "seller";
  const isSystem = message.senderType === "system";
  const time = new Date(message.createdAt).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const meta = parseMeta(message.metadataJson);
  const shared = parseSharedProduct(message.metadataJson);
  const sub = parseSubstitution(message.metadataJson);
  const order = parseChatOrder(message.metadataJson);
  const payment = parseChatPayment(message.metadataJson);

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[length:var(--ts-xs)] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <Settings2 className="h-3 w-3" />
          <span>{message.body}</span>
          <span className="text-slate-400">· {time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2", isSeller ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
          isSeller
            ? "bg-primary text-white"
            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
        )}
        aria-hidden
      >
        {isSeller ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      {/* Columna de la burbuja */}
      <div className={cn("flex max-w-[70%] flex-col", isSeller ? "items-end" : "items-start")}>
        {/* Burbuja — click abre la barra de acciones (reaccionar/responder) */}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Reaccionar o responder"
          className={cn(
            "rounded-xl px-4 py-2 text-left text-sm leading-relaxed outline-none transition-shadow",
            active && "ring-2 ring-primary/40",
            isSeller
              ? "rounded-br-sm bg-primary text-white"
              : "rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
          )}
        >
          {/* Cita (reply) */}
          {meta.replyTo && (
            <div
              className={cn(
                "mb-1 rounded-md border-l-[3px] px-2 py-1",
                isSeller ? "border-white/70 bg-white/15" : "border-primary bg-primary/10",
              )}
            >
              <div className={cn("text-[length:var(--ts-2xs)] font-bold", isSeller ? "text-white/90" : "text-primary")}>
                {meta.replyTo.senderType === "seller" ? "Vos" : meta.replyTo.senderName}
              </div>
              <div className={cn("truncate text-[length:var(--ts-xs)]", isSeller ? "text-white/80" : "text-slate-600 dark:text-slate-300")}>
                {meta.replyTo.body}
              </div>
            </div>
          )}
          {/* Bot AI-first (Tanda 3) — marca las respuestas que mandó el asistente */}
          {meta.autoReply && (
            <div className={cn(
              "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
              isSeller ? "bg-white/20 text-white" : "bg-primary/10 text-primary",
            )}>
              <Bot className="h-3 w-3" aria-hidden /> Asistente automático
            </div>
          )}
          {!isSeller && (
            <div className="mb-0.5 text-[length:var(--ts-xs)] font-semibold text-slate-500 dark:text-slate-400">
              {message.senderName}
            </div>
          )}
          {/* Tarjeta de producto compartido (Tanda 2) — el vendedor ve lo que mandó */}
          {shared && (
            <div className={cn(
              "mb-1 flex items-center gap-2 rounded-lg border p-2",
              isSeller ? "border-white/30 bg-white/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
            )}>
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white">
                {shared.image ? (
                  <Image src={shared.image} alt="" fill sizes="44px" className="object-contain p-0.5" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <ShoppingCart className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className={cn("truncate text-[length:var(--ts-xs)] font-bold", isSeller ? "text-white" : "text-slate-900 dark:text-slate-100")}>
                  {shared.name}
                </p>
                <p className={cn("text-sm font-black tabular-nums", isSeller ? "text-white" : "text-primary")}>
                  {fmtSoles(shared.price)}
                </p>
              </div>
            </div>
          )}
          {/* Pedido armado (Tanda 2) — read-only */}
          {order && (
            <div className={cn(
              "mb-1 overflow-hidden rounded-lg border",
              isSeller ? "border-white/30 bg-white/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
            )}>
              <p className={cn("px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase", isSeller ? "text-white/90" : "text-primary")}>
                Pedido armado
              </p>
              <ul>
                {order.items.map((it, i) => (
                  <li key={`${it.storeProductId}-${i}`} className={cn(
                    "flex items-center justify-between gap-2 border-t px-2.5 py-1 text-[length:var(--ts-xs)]",
                    isSeller ? "border-white/20 text-white/90" : "border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200",
                  )}>
                    <span className="min-w-0 truncate">{it.quantity}× {it.name}</span>
                    <span className="shrink-0 font-bold tabular-nums">{fmtSoles(it.price * it.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className={cn(
                "flex items-center justify-between border-t px-2.5 py-1 text-[length:var(--ts-xs)] font-black",
                isSeller ? "border-white/20 text-white" : "border-slate-100 text-primary dark:border-slate-800",
              )}>
                <span>Total</span><span className="tabular-nums">{fmtSoles(order.total)}</span>
              </div>
            </div>
          )}
          {/* Sustitución propuesta (Tanda 2) — read-only */}
          {sub && (
            <div className={cn(
              "mb-1 rounded-lg border p-2",
              isSeller ? "border-white/30 bg-white/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
            )}>
              <p className={cn("text-[length:var(--ts-2xs)] font-bold uppercase", isSeller ? "text-white/90" : "text-[var(--data-warning-700)]")}>
                Cambio propuesto
              </p>
              <p className={cn("text-[length:var(--ts-xs)]", isSeller ? "text-white/90" : "text-slate-600 dark:text-slate-300")}>
                Falta <strong>{sub.originalName}</strong> → <strong>{sub.replacement.name}</strong> ({fmtSoles(sub.replacement.price)})
              </p>
            </div>
          )}
          {/* Cobro Yape/Plin (Tanda 2) — read-only, lo que pidió la tienda */}
          {payment && (
            <div className={cn(
              "mb-1 overflow-hidden rounded-lg border",
              isSeller ? "border-white/30 bg-white/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
            )}>
              <div className={cn(
                "flex items-center justify-between gap-2 px-2.5 py-1.5",
                isSeller ? "text-white" : "text-primary",
              )}>
                <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase">
                  <Wallet className="h-3.5 w-3.5" aria-hidden /> Cobro {payment.method === "plin" ? "Plin" : "Yape"}
                </span>
                <span className="text-sm font-black tabular-nums">{fmtSoles(payment.amount)}</span>
              </div>
              {payment.number && (
                <p className={cn(
                  "border-t px-2.5 py-1 text-[length:var(--ts-xs)] tabular-nums",
                  isSeller ? "border-white/20 text-white/90" : "border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-300",
                )}>
                  {payment.method === "plin" ? "Plin" : "Yape"}: <strong>{payment.number}</strong>
                </p>
              )}
              {payment.note && (
                <p className={cn(
                  "border-t px-2.5 py-1 text-[length:var(--ts-xs)]",
                  isSeller ? "border-white/20 text-white/80" : "border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400",
                )}>
                  {payment.note}
                </p>
              )}
            </div>
          )}
          {!order && !payment && <div className="whitespace-pre-wrap break-words">{message.body}</div>}
        </button>

        {/* Barra de acciones — emojis + responder */}
        {active && (
          <div className="z-10 mt-1 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md dark:border-slate-700 dark:bg-slate-900">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact?.(message.id, e)}
                aria-label={`Reaccionar ${e}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125"
              >
                {e}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
            <button
              type="button"
              onClick={() =>
                onReply?.({
                  id: message.id,
                  body: message.body.slice(0, 200),
                  senderType: message.senderType,
                  senderName: message.senderName,
                })
              }
              aria-label="Responder a este mensaje"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Undo2 className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        )}

        {/* Reacciones — pills bajo la burbuja */}
        {meta.reactions.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {meta.reactions.map((r, idx) => (
              <button
                key={`${r.by}-${idx}`}
                type="button"
                onClick={() => { if (r.by === "seller") onReact?.(message.id, r.emoji); }}
                aria-label={`Reacción ${r.emoji}${r.by === "seller" ? " (tuya)" : " del cliente"}`}
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs leading-none",
                  r.by === "seller"
                    ? "border-primary/40 bg-primary/10"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
                )}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[length:var(--ts-2xs)] text-slate-400",
            isSeller ? "justify-end" : "justify-start",
          )}
        >
          <span>{time}</span>
          {isSeller && message.readByBuyerAt && <span aria-label="Leído">· ✓✓</span>}
        </div>
      </div>
    </div>
  );
}
