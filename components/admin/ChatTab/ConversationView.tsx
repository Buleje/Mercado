"use client";

import { useEffect, useRef } from "react";
import { Bot, User, Settings2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ChatMessageView } from "./types";

interface ConversationViewProps {
  messages: ChatMessageView[];
  loading: boolean;
  emptyState?: string;
}

export function ConversationView({
  messages,
  loading,
  emptyState = "Seleccioná una conversación para verla",
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageView }) {
  const isSeller = message.senderType === "seller";
  const isSystem = message.senderType === "system";
  const time = new Date(message.createdAt).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

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

      {/* Bubble */}
      <div className={cn("max-w-[70%]", isSeller ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-xl px-4 py-2 text-sm leading-relaxed",
            isSeller
              ? "rounded-br-sm bg-primary text-white"
              : "rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
          )}
        >
          {!isSeller && (
            <div className="mb-0.5 text-[length:var(--ts-xs)] font-semibold text-slate-500 dark:text-slate-400">
              {message.senderName}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{message.body}</div>
        </div>
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
