"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type {
  ChatBubbleSession,
  PublicMessageView,
  PublicThreadView,
} from "./types";

const sessionKey = (storeSlug: string) => `buleje-chat-${storeSlug}`;

function loadSession(storeSlug: string): ChatBubbleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionKey(storeSlug));
    if (!raw) return null;
    return JSON.parse(raw) as ChatBubbleSession;
  } catch {
    return null;
  }
}

function saveSession(storeSlug: string, session: ChatBubbleSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(sessionKey(storeSlug), JSON.stringify(session));
  } catch {
    // localStorage puede estar desactivado — seguir sin persistencia
  }
}

/**
 * Hook principal del widget. Maneja:
 * - Sesión del buyer persistida en localStorage
 * - Apertura/reutilización del thread (POST /api/chat/public?action=open)
 * - Envío de mensajes (POST /api/chat/public?action=send)
 * - Listado de mensajes con polling (GET /api/chat/public)
 */
export function usePublicChat(storeSlug: string) {
  const [session, setSession] = useState<ChatBubbleSession | null>(() =>
    loadSession(storeSlug),
  );
  const [thread, setThread] = useState<PublicThreadView | null>(null);
  const [messages, setMessages] = useState<PublicMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll de mensajes cada 6s cuando hay sesión activa
  const pollMessages = useCallback(async () => {
    if (!session) return;
    try {
      const qs = new URLSearchParams({
        threadId: session.threadId,
        storeSlug,
        customerPhone: session.customerPhone,
      });
      const res = await fetch(`/api/chat/public?${qs.toString()}`);
      if (!res.ok) {
        if (res.status === 503) {
          setError("Chat temporalmente no disponible");
          return;
        }
        if (res.status === 404) {
          // Thread roto — limpiar sesión
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(sessionKey(storeSlug));
          }
          setSession(null);
          setThread(null);
          setMessages([]);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: PublicMessageView[] };
      setMessages(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar mensajes");
    }
  }, [session, storeSlug]);

  useEffect(() => {
    if (!session) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      setMessages([]);
      return;
    }
    let cancelled = false;
    let pollInterval = 6000;
    let es: EventSource | null = null;

    // Brandon 2026-05-16 (realtime): SSE primario via /api/chat/public/stream.
    // Si conecta, el polling baja a 60s (fallback). Si SSE cae, vuelve a 6s.
    try {
      const qs = new URLSearchParams({
        threadId: session.threadId,
        storeSlug,
        customerPhone: session.customerPhone,
      });
      es = new EventSource(`/api/chat/public/stream?${qs.toString()}`);
      es.addEventListener("open", () => {
        pollInterval = 60_000;
      });
      es.addEventListener("error", () => {
        pollInterval = 6000;
      });
      es.addEventListener("chat_message", () => {
        // Refetch los mensajes — el server-side guarda el thread completo,
        // refrescamos para mantener orden y markAsRead.
        void pollMessages();
      });
    } catch {
      /* SSE no disponible — polling cubre */
    }

    const loop = async () => {
      if (cancelled) return;
      await pollMessages();
      pollTimerRef.current = setTimeout(loop, pollInterval);
    };
    loop();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      try { es?.close(); } catch { /* ignore */ }
    };
  }, [session, pollMessages, storeSlug]);

  /**
   * Abre (o recupera) un thread para este buyer. Si ya hay sesión guardada,
   * la reutiliza. Si no, crea una nueva con los datos ingresados.
   */
  const startChat = useCallback(
    async (args: {
      customerName: string;
      customerPhone: string;
      firstMessage?: string;
      orderId?: string;
      subject?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/public?action=open", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            storeSlug,
            customerPhone: args.customerPhone,
            customerName: args.customerName,
            orderId: args.orderId,
            subject: args.subject,
            firstMessage: args.firstMessage,
          }),
        });
        if (!res.ok) {
          if (res.status === 503) throw new Error("Chat temporalmente no disponible");
          if (res.status === 404) throw new Error("Tienda no disponible");
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data: PublicThreadView };
        const newSession: ChatBubbleSession = {
          threadId: json.data.threadId,
          customerPhone: args.customerPhone,
          customerName: args.customerName,
        };
        saveSession(storeSlug, newSession);
        setSession(newSession);
        setThread(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al abrir chat");
      } finally {
        setLoading(false);
      }
    },
    [storeSlug],
  );

  /**
   * Envía un mensaje del buyer al hilo activo.
   */
  const sendMessage = useCallback(
    async (body: string) => {
      if (!session) {
        setError("No hay sesión activa");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/public?action=send", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            threadId: session.threadId,
            storeSlug,
            customerPhone: session.customerPhone,
            customerName: session.customerName,
            body,
          }),
        });
        if (!res.ok) {
          if (res.status === 409) throw new Error("La conversación está cerrada");
          if (res.status === 404) throw new Error("Conversación no encontrada");
          throw new Error(`HTTP ${res.status}`);
        }
        await pollMessages(); // reload inmediato después del envío
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al enviar mensaje");
      } finally {
        setLoading(false);
      }
    },
    [session, storeSlug, pollMessages],
  );

  /**
   * Cierra la sesión local (sin cerrar el thread del servidor — el buyer
   * puede volver a abrir el chat en el futuro y recuperar los mensajes si
   * todavía conocemos el threadId).
   */
  const clearSession = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(sessionKey(storeSlug));
    }
    setSession(null);
    setThread(null);
    setMessages([]);
  }, [storeSlug]);

  return {
    session,
    thread,
    messages,
    loading,
    error,
    startChat,
    sendMessage,
    clearSession,
  };
}
