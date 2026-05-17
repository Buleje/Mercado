"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { ChatThreadView, ChatMessageView, ThreadStatus } from "./types";

/**
 * Hook: lista de hilos del tenant con polling automático cada 8s.
 * Soporta filtros por status.
 */
export function useChatThreads(initialStatus: ThreadStatus | "all" = "open") {
  const [threads, setThreads] = useState<ChatThreadView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ThreadStatus | "all">(initialStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await tenantFetch(`/api/admin/chat/threads${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ChatThreadView[] };
      setThreads(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    let pollMs = 8000;
    let es: EventSource | null = null;

    // Brandon 2026-05-16 (realtime): SSE primario sobre el canal admin
    // existente (/api/admin/sse) — eventos chat_message_new y
    // chat_thread_opened disparan reload inmediato. Si SSE conecta,
    // polling baja a 60s (fallback). Si cae, vuelve a 8s.
    try {
      es = new EventSource("/api/admin/sse");
      es.addEventListener("open", () => { pollMs = 60_000; });
      es.addEventListener("error", () => { pollMs = 8000; });
      es.addEventListener("chat_thread_opened", () => { void load(); });
      es.addEventListener("chat_message_new", () => { void load(); });
    } catch {
      /* SSE no disponible — polling cubre */
    }

    const loop = async () => {
      if (cancelled) return;
      await load();
      timerRef.current = setTimeout(loop, pollMs);
    };
    loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try { es?.close(); } catch { /* ignore */ }
    };
  }, [load]);

  const closeThread = useCallback(
    async (threadId: string, reason?: string) => {
      const res = await tenantFetch("/api/admin/chat/threads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, reason }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [load],
  );

  return {
    threads,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    reload: load,
    closeThread,
  };
}

/**
 * Hook: mensajes de un hilo específico con polling 5s.
 * Auto-marca como leído gracias al GET del admin.
 */
export function useChatMessages(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    try {
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ChatMessageView[] };
      setMessages(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await load();
      timerRef.current = setTimeout(loop, 5000);
    };
    loop();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [threadId, load]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!threadId) throw new Error("No thread seleccionado");
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  return { messages, loading, error, reload: load, sendMessage };
}
