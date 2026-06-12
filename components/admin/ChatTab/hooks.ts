"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import { fmtSoles, orderTotal, type SharedChatProduct, type ChatOrderItem, type ChatPayment } from "@/lib/chat/shared-product";
import type { ChatThreadView, ChatMessageView, ThreadStatus } from "./types";

// Increment 2b: cita + presencia del lado vendedor.
export interface MsgReplySnapshot {
  id: string;
  body: string;
  senderType: "buyer" | "seller" | "system";
  senderName: string;
}
export interface BuyerPresence { typing: boolean; online: boolean; lastSeen: number | null }

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

  /** Tanda 3: setea las etiquetas de triage de un hilo (reemplaza el set). */
  const setLabels = useCallback(
    async (threadId: string, labels: string[]) => {
      const res = await tenantFetch("/api/admin/chat/threads?action=labels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, labels }),
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
    setLabels,
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
  const [presence, setPresence] = useState<BuyerPresence | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingPingRef = useRef(0);

  const load = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      setPresence(null);
      return;
    }
    try {
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ChatMessageView[]; presence?: BuyerPresence };
      setMessages(json.data);
      setPresence(json.presence ?? null);
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
    async (body: string, replyTo?: MsgReplySnapshot) => {
      if (!threadId) throw new Error("No thread seleccionado");
      // Increment 2b: si es cita, adjuntar snapshot en metadataJson.
      const metadataJson = replyTo
        ? JSON.stringify({ replyTo: { ...replyTo, body: replyTo.body.slice(0, 200) } })
        : undefined;
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, ...(metadataJson ? { metadataJson } : {}) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Increment 2b: toggle de reacción del vendedor (optimista + server). */
  const react = useCallback(
    async (messageId: string, emoji: string) => {
      if (!threadId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          let meta: { reactions?: Array<{ emoji: string; by: string }>; replyTo?: unknown } = {};
          try { meta = m.metadataJson ? JSON.parse(m.metadataJson) : {}; } catch { meta = {}; }
          const reactions = Array.isArray(meta.reactions) ? meta.reactions : [];
          const mine = reactions.find((x) => x.by === "seller");
          let next = reactions.filter((x) => x.by !== "seller");
          if (!mine || mine.emoji !== emoji) next = [...next, { emoji, by: "seller" }];
          return { ...m, metadataJson: JSON.stringify({ ...meta, reactions: next }) };
        }),
      );
      try {
        await tenantFetch(
          `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages?action=react`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId, emoji }),
          },
        );
      } catch { /* el polling reconcilia */ }
    },
    [threadId],
  );

  /** Tanda 2: comparte un producto del catálogo en el hilo (tarjeta cart-ready). */
  const shareProduct = useCallback(
    async (product: SharedChatProduct) => {
      if (!threadId) return;
      const body = `Te comparto: ${product.name} — ${fmtSoles(product.price)}`;
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, metadataJson: JSON.stringify({ product }) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Tanda 2: arma un pedido (varios productos) y lo manda para que el cliente
      lo confirme (se le agrega todo al carrito → checkout normal). */
  const sendOrder = useCallback(
    async (items: ChatOrderItem[]) => {
      if (!threadId || items.length === 0) return;
      const lines = items.map((i) => `• ${i.quantity}× ${i.name}`).join("\n");
      const body = `Te armé este pedido (${fmtSoles(orderTotal(items))}):\n${lines}\n¿Lo confirmás?`;
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, metadataJson: JSON.stringify({ order: { items } }) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Tanda 2: envía una SOLICITUD de cobro Yape/Plin (manual, sin gateway). */
  const sendPayment = useCallback(
    async (payment: ChatPayment) => {
      if (!threadId) return;
      const methodLabel = payment.method === "plin" ? "Plin" : "Yape";
      const numTxt = payment.number ? ` al ${payment.number}` : "";
      const noteTxt = payment.note ? ` — ${payment.note}` : "";
      const body = `Cobro por ${methodLabel}: ${fmtSoles(payment.amount)}${numTxt}${noteTxt}. Cuando pagues, tocá "Ya pagué".`;
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, metadataJson: JSON.stringify({ payment }) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Tanda 2: propone una sustitución de faltante ("no hay X, ¿te mando Y?"). */
  const proposeSubstitution = useCallback(
    async (originalName: string, replacement: SharedChatProduct) => {
      if (!threadId) return;
      const body = `No tengo "${originalName}". ¿Te mando ${replacement.name} (${fmtSoles(replacement.price)}) en su lugar?`;
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, metadataJson: JSON.stringify({ substitution: { originalName, replacement } }) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Tanda 4: pide una reseña post-entrega. Manda una tarjeta con estrellas que
      el cliente toca para opinar en la tienda. */
  const requestReview = useCallback(
    async (storeSlug: string, storeName: string) => {
      if (!threadId || !storeSlug) return;
      const body = "⭐ ¿Cómo estuvo tu pedido? Nos ayudaría un montón tu reseña 🙏";
      const res = await tenantFetch(
        `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, metadataJson: JSON.stringify({ reviewRequest: { storeSlug, storeName } }) }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    },
    [threadId, load],
  );

  /** Tanda 3: pide a la IA 3 respuestas sugeridas para el último mensaje del
      cliente. No envía nada — el vendedor elige/edita y manda. */
  const suggestReplies = useCallback(async (): Promise<string[]> => {
    if (!threadId) return [];
    const res = await tenantFetch(
      `/api/admin/chat/threads/${encodeURIComponent(threadId)}/suggest`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { suggestions?: string[] } };
    return Array.isArray(json.data?.suggestions) ? json.data!.suggestions! : [];
  }, [threadId]);

  /** Increment 2b: avisa "escribiendo…" al cliente (throttle ~3.5s). */
  const pingTyping = useCallback(() => {
    if (!threadId) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 3500) return;
    lastTypingPingRef.current = now;
    tenantFetch(
      `/api/admin/chat/threads/${encodeURIComponent(threadId)}/messages?action=typing`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    ).catch(() => { /* efímero */ });
  }, [threadId]);

  return { messages, loading, error, reload: load, sendMessage, react, pingTyping, shareProduct, proposeSubstitution, sendOrder, sendPayment, suggestReplies, requestReview, presence };
}
