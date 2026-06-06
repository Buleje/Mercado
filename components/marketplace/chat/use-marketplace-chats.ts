"use client";

/**
 * useMarketplaceChats — bandeja de conversaciones del chat marketplace
 * (estilo Messenger) + badge global de no-leídos para el navbar.
 *
 * v2 (Brandon 2026-06-06): sistema D2 (ConversationThread) — el mismo que
 * lee la tienda en su panel. Además:
 *   - Detección de mensajes ENTRANTES entre polls → dispara el evento
 *     `buleje:chat-incoming` (toast estilo FB) + vibración en mobile.
 *   - Badge en el título de la pestaña: "(2) Buleje…" cuando hay no-leídos.
 *
 * Polling adaptativo: 15s bandeja cerrada · 6s abierta. Sin sesión no fetchea.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomerSafe } from "@/hooks/use-customer-safe";

export interface ChatConversation {
  threadId: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo: string | null;
  lastMessage: string;
  lastSenderType: "store" | "customer";
  lastAt: string;
  unreadCount: number;
}

/** Detail del evento `buleje:chat-incoming` (toast de mensaje nuevo). */
export interface ChatIncomingDetail {
  threadId: string;
  storeId: string;
  storeName: string;
  storeLogo: string | null;
  preview: string;
}

const POLL_IDLE_MS = 15_000;
const POLL_ACTIVE_MS = 6_000;

export function useMarketplaceChats(panelOpen: boolean) {
  const customer = useCustomerSafe();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadedOnce = useRef(false);
  // Firma del último mensaje por thread — para detectar ENTRANTES nuevos.
  const lastSeenRef = useRef<Map<string, string>>(new Map());

  const refresh = useCallback(async () => {
    if (!customer?.phone) return;
    try {
      const res = await fetch("/api/chat/marketplace/conversations", {
        credentials: "include",
      });
      if (!res.ok) return; // 401 = sesión vencida → el badge simplemente no aparece
      const j = (await res.json()) as { data: ChatConversation[]; unreadTotal: number };
      const next = j.data ?? [];

      // ── Detección de mensajes entrantes (solo tras la primera carga) ──
      if (loadedOnce.current) {
        for (const conv of next) {
          if (!conv.threadId || conv.lastSenderType !== "store" || conv.unreadCount === 0) continue;
          const sig = `${conv.lastAt}|${conv.lastMessage}`;
          const prev = lastSeenRef.current.get(conv.threadId);
          if (prev !== undefined && prev !== sig) {
            // Mensaje NUEVO de la tienda → toast + vibración
            window.dispatchEvent(
              new CustomEvent<ChatIncomingDetail>("buleje:chat-incoming", {
                detail: {
                  threadId: conv.threadId,
                  storeId: conv.storeId,
                  storeName: conv.storeName,
                  storeLogo: conv.storeLogo,
                  preview: conv.lastMessage,
                },
              }),
            );
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(60); } catch { /* sin soporte */ }
            }
          }
        }
      }
      for (const conv of next) {
        if (conv.threadId) lastSeenRef.current.set(conv.threadId, `${conv.lastAt}|${conv.lastMessage}`);
      }

      setConversations(next);
      setUnreadTotal(j.unreadTotal ?? 0);
      loadedOnce.current = true;
    } catch {
      /* polling no crítico */
    }
  }, [customer?.phone]);

  // Carga inicial + polling adaptativo.
  useEffect(() => {
    if (!customer?.phone) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!loadedOnce.current) setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    };
    void tick();
    const interval = window.setInterval(tick, panelOpen ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [customer?.phone, panelOpen, refresh]);

  // Badge "(N)" en el título de la pestaña — como Facebook.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [unreadTotal]);

  /** Marca leído un thread (optimista + server). */
  const markRead = useCallback((threadId: string | null) => {
    if (!threadId) return;
    setConversations((prev) => {
      const next = prev.map((c) => (c.threadId === threadId ? { ...c, unreadCount: 0 } : c));
      setUnreadTotal(next.reduce((n, c) => n + c.unreadCount, 0));
      return next;
    });
    const token = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
    fetch("/api/chat/marketplace/conversations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-csrf-token": decodeURIComponent(token) } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ threadId }),
    }).catch(() => {
      /* fire-and-forget — el próximo poll reconcilia */
    });
  }, []);

  return { customer, conversations, unreadTotal, loading, refresh, markRead };
}
