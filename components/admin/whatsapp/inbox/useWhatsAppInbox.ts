"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos del inbox (espejo de lib/db/whatsapp-messages.db.ts) ────────────────

export type WaDirection = "in" | "out";
export type WaSentBy = "customer" | "ai" | "admin";

export interface WaConversation {
  customerPhone: string;
  customerName: string;
  lastMessage: string;
  lastDirection: WaDirection;
  lastSentBy: WaSentBy;
  lastAt: string;
  unread: number;
}

export interface WaMessage {
  id: string;
  customerPhone: string;
  customerName: string;
  direction: WaDirection;
  sentBy: WaSentBy;
  body: string;
  status: "received" | "sent" | "failed";
  read: boolean;
  createdAt: string;
}

export interface WaConnection {
  connected: boolean;
  active: boolean;
  phoneNumberId?: string;
  businessName?: string | null;
}

const CONVS_POLL_MS = 8_000;
const MSGS_POLL_MS = 5_000;

/**
 * Hook del inbox WhatsApp: conversaciones (poll 8s) + hilo seleccionado
 * (poll 5s) + enviar + marcar leído. Estado de conexión del número incluido.
 */
export function useWhatsAppInbox() {
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [connection, setConnection] = useState<WaConnection | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState(false);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedPhone;

  const loadConversations = useCallback(async () => {
    try {
      const res = await tenantFetch("/api/admin/whatsapp/conversations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        conversations: WaConversation[];
        connection: WaConnection;
      };
      setConversations(json.conversations);
      setConnection(json.connection);
      setConvsError(false);
    } catch {
      setConvsError(true);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (phone: string, showSpinner: boolean) => {
    if (showSpinner) setLoadingMsgs(true);
    try {
      const res = await tenantFetch(
        `/api/admin/whatsapp/messages?phone=${encodeURIComponent(phone)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { messages: WaMessage[] };
      // Evitar pisar el hilo si el usuario cambió de conversación durante el fetch
      if (selectedRef.current === phone) setMessages(json.messages);
    } catch {
      /* el próximo poll reintenta */
    } finally {
      if (showSpinner) setLoadingMsgs(false);
    }
  }, []);

  const markRead = useCallback(
    async (phone: string) => {
      try {
        await tenantFetch("/api/admin/whatsapp/messages", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ phone }),
        });
        // Refrescar el badge de la lista sin esperar el próximo poll
        setConversations((prev) =>
          prev.map((c) => (c.customerPhone === phone ? { ...c, unread: 0 } : c)),
        );
      } catch {
        /* best-effort: el badge se corrige en el próximo poll */
      }
    },
    [],
  );

  const selectConversation = useCallback(
    (phone: string | null) => {
      setSelectedPhone(phone);
      setMessages([]);
      setSendError(null);
      if (phone) {
        void loadMessages(phone, true);
        void markRead(phone);
      }
    },
    [loadMessages, markRead],
  );

  const sendMessage = useCallback(
    async (body: string): Promise<boolean> => {
      const phone = selectedRef.current;
      if (!phone || !body.trim()) return false;
      setSending(true);
      setSendError(null);
      try {
        const res = await tenantFetch("/api/admin/whatsapp/send", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            phone,
            message: body.trim(),
            customerName: conversations.find((c) => c.customerPhone === phone)?.customerName,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setSendError(json.error ?? "No se pudo enviar el mensaje.");
          // El intento fallido quedó en el log del servidor → refrescar el hilo
          void loadMessages(phone, false);
          return false;
        }
        await loadMessages(phone, false);
        void loadConversations();
        return true;
      } catch {
        setSendError("Sin conexión. Intenta de nuevo.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversations, loadConversations, loadMessages],
  );

  // Poll de conversaciones
  useEffect(() => {
    void loadConversations();
    const t = setInterval(() => void loadConversations(), CONVS_POLL_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  // Poll del hilo abierto
  useEffect(() => {
    if (!selectedPhone) return;
    const t = setInterval(() => void loadMessages(selectedPhone, false), MSGS_POLL_MS);
    return () => clearInterval(t);
  }, [selectedPhone, loadMessages]);

  return {
    conversations,
    connection,
    loadingConvs,
    convsError,
    selectedPhone,
    selectConversation,
    messages,
    loadingMsgs,
    sendMessage,
    sending,
    sendError,
    refresh: loadConversations,
  };
}
