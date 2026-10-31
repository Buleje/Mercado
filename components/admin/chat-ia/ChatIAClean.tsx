"use client";

/**
 * ChatIAClean — el chat del Asistente IA.
 *
 *  - Arriba, UNA fila: tono, «N esperan tu OK», borrar y pantalla completa.
 *  - Al centro, la conversación (máx. 3xl centrada) o, vacía, los chips de
 *    «Anota» (van al campo para cambiar los datos) y «Pregúntale» (se mandan).
 *  - Abajo, el campo: texto, dictado, audio de WhatsApp y enviar.
 *  - Streaming real desde /api/ai-assistant por SSE (hook `useChatIA`).
 */

import { useEffect, useRef } from "react";
import { CabeceraChat } from "./CabeceraChat";
import { Compositor, type CompositorHandle } from "./Compositor";
import { EmptyState } from "./EmptyState";
import { MessageRow } from "./MessageRow";
import { useChatIA } from "./use-chat-ia";
import { usePendientesOK } from "./use-pendientes-ok";
import { useTonoChat } from "./use-tono-chat";

interface ChatIACleanProps {
  maximizado?: boolean;
  onMaximizar?: () => void;
}

export default function ChatIAClean({
  maximizado = false,
  onMaximizar = () => {},
}: ChatIACleanProps) {
  const { tono, setTono } = useTonoChat();
  const { pendientes, recargar } = usePendientesOK();
  const chat = useChatIA(tono, recargar);
  const { messages, streaming } = chat;
  const finRef = useRef<HTMLDivElement | null>(null);
  const campoRef = useRef<CompositorHandle | null>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const ultimo = messages[messages.length - 1];

  return (
    <div className="flex h-full flex-col bg-[var(--surface-raised)]">
      <CabeceraChat
        tono={tono}
        onTono={setTono}
        pendientes={pendientes}
        hayMensajes={messages.length > 0}
        ocupado={streaming}
        onBorrar={chat.borrar}
        maximizado={maximizado}
        onMaximizar={onMaximizar}
      />

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState
            onAnotar={(frase) => campoRef.current?.poner(frase)}
            onPreguntar={(prompt) => void chat.enviar(prompt)}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                isStreaming={streaming && m.role === "assistant" && m === ultimo}
                copied={chat.copiedId === m.id}
                onCopy={() => void chat.copiar(m)}
                onResolverAprobacion={chat.resolverAprobacion}
              />
            ))}
            <div ref={finRef} />
          </div>
        )}
      </div>

      <Compositor
        ref={campoRef}
        streaming={streaming}
        onEnviar={chat.enviar}
        onDetener={chat.detener}
      />
    </div>
  );
}
