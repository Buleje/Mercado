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
  /** Número del negocio por el que habla este cliente (multi-número). */
  phoneNumberId: string;
  lastMessage: string;
  lastDirection: WaDirection;
  lastSentBy: WaSentBy;
  lastAt: string;
  unread: number;
}

export interface WaNumber {
  id: string;
  label: string | null;
  phoneNumberId: string;
  businessName: string | null;
  isActive: boolean;
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

/** Ficha CRM del cliente del hilo (pedidos + fiado + fidelización). */
export interface WaCustomerContext {
  customer: { name: string; loyaltyTier?: string; loyaltyPoints?: number } | null;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  fiadoSaldo: number;
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
  const [numbers, setNumbers] = useState<WaNumber[]>([]);
  // Hilos con el bot IA pausado (el operador atiende a mano)
  const [pausedPhones, setPausedPhones] = useState<string[]>([]);
  // Conversaciones archivadas (fuera de la lista principal)
  const [archivedPhones, setArchivedPhones] = useState<string[]>([]);
  // Ficha CRM del cliente del hilo abierto
  const [customerContext, setCustomerContext] = useState<WaCustomerContext | null>(null);
  // Multi-número: filtrar el inbox por un número del negocio (null = todos)
  const [numberFilter, setNumberFilter] = useState<string | null>(null);
  const numberFilterRef = useRef<string | null>(null);
  numberFilterRef.current = numberFilter;
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState(false);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  // Conversación NUEVA (aún sin mensajes): contacto elegido a mano por el operador
  const [draftContact, setDraftContact] = useState<{ phone: string; name: string } | null>(null);
  const draftRef = useRef<{ phone: string; name: string } | null>(null);
  draftRef.current = draftContact;

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // 131047 = fuera de ventana 24h → la UI ofrece mandar plantilla
  const [sendErrorCode, setSendErrorCode] = useState<number | null>(null);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedPhone;

  const loadConversations = useCallback(async () => {
    try {
      const filter = numberFilterRef.current;
      const qs = filter ? `?phoneNumberId=${encodeURIComponent(filter)}` : "";
      const res = await tenantFetch(`/api/admin/whatsapp/conversations${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        conversations: WaConversation[];
        numbers: WaNumber[];
        connection: WaConnection;
        pausedPhones?: string[];
        archivedPhones?: string[];
      };
      // Evitar pisar la lista si el usuario cambió el filtro durante el fetch
      if (numberFilterRef.current === filter) {
        setConversations(json.conversations);
        setNumbers(json.numbers ?? []);
        setConnection(json.connection);
        setPausedPhones(json.pausedPhones ?? []);
        setArchivedPhones(json.archivedPhones ?? []);
        setConvsError(false);
      }
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

  /** Ficha CRM del cliente — se carga al abrir el hilo, no en cada poll. */
  const loadCustomerContext = useCallback(async (phone: string) => {
    setCustomerContext(null);
    try {
      const res = await tenantFetch(
        `/api/admin/whatsapp/customer-context?phone=${encodeURIComponent(phone)}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as WaCustomerContext;
      if (selectedRef.current === phone) setCustomerContext(json);
    } catch {
      /* la ficha es best-effort: sin ella el chat funciona igual */
    }
  }, []);

  const selectConversation = useCallback(
    (phone: string | null) => {
      setSelectedPhone(phone);
      setMessages([]);
      setSendError(null);
      setCustomerContext(null);
      if (phone) {
        void loadMessages(phone, true);
        void markRead(phone);
        void loadCustomerContext(phone);
      }
    },
    [loadMessages, markRead, loadCustomerContext],
  );

  /**
   * Inicia un chat con un número que todavía no escribió (estilo ➕ de WhatsApp).
   * El hilo queda "borrador" hasta que sale el primer mensaje/plantilla.
   */
  const startConversation = useCallback(
    (phone: string, name: string) => {
      setDraftContact({ phone, name: name.trim() || "Cliente" });
      selectConversation(phone);
    },
    [selectConversation],
  );

  /** POST a /send con texto libre o plantilla; maneja errores y refresca. */
  const doSend = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      const phone = selectedRef.current;
      if (!phone) return false;
      setSending(true);
      setSendError(null);
      setSendErrorCode(null);
      try {
        const conv = conversations.find((c) => c.customerPhone === phone);
        // Conversación nueva: usar el nombre del borrador (aún no está en la lista)
        const draft = draftRef.current?.phone === phone ? draftRef.current : null;
        const res = await tenantFetch("/api/admin/whatsapp/send", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            phone,
            customerName: conv?.customerName ?? draft?.name,
            // Multi-número: responder por el mismo número por el que habla el cliente
            phoneNumberId: conv?.phoneNumberId,
            ...payload,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; code?: number };
        if (!res.ok) {
          setSendError(json.error ?? "No se pudo enviar el mensaje.");
          setSendErrorCode(json.code ?? null);
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

  const sendMessage = useCallback(
    async (body: string): Promise<boolean> => {
      if (!body.trim()) return false;
      return doSend({ message: body.trim() });
    },
    [doSend],
  );

  /** Plantilla aprobada de Meta — única vía fuera de la ventana de 24h. */
  const sendTemplate = useCallback(
    async (tpl: { name: string; language: string; params: string[] }): Promise<boolean> => {
      return doSend({ template: tpl });
    },
    [doSend],
  );

  /** Archiva/desarchiva una conversación (optimista). */
  const toggleArchive = useCallback(async (phone: string, archived: boolean) => {
    setArchivedPhones((prev) =>
      archived ? Array.from(new Set([...prev, phone])) : prev.filter((p) => p !== phone),
    );
    try {
      const res = await tenantFetch("/api/admin/whatsapp/archive", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone, archived }),
      });
      const json = (await res.json().catch(() => ({}))) as { archivedPhones?: string[] };
      if (res.ok && json.archivedPhones) setArchivedPhones(json.archivedPhones);
    } catch {
      /* el próximo poll corrige */
    }
  }, []);

  /** Pausa/reanuda el bot IA en un hilo (optimista, corrige con la respuesta). */
  const toggleBotPause = useCallback(async (phone: string, paused: boolean) => {
    setPausedPhones((prev) =>
      paused ? Array.from(new Set([...prev, phone])) : prev.filter((p) => p !== phone),
    );
    try {
      const res = await tenantFetch("/api/admin/whatsapp/bot-pause", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone, paused }),
      });
      const json = (await res.json().catch(() => ({}))) as { pausedPhones?: string[] };
      if (res.ok && json.pausedPhones) setPausedPhones(json.pausedPhones);
    } catch {
      /* el próximo poll corrige el estado */
    }
  }, []);

  // Poll de conversaciones (recarga inmediata al cambiar el filtro de número)
  useEffect(() => {
    setLoadingConvs(true);
    void loadConversations();
    const t = setInterval(() => void loadConversations(), CONVS_POLL_MS);
    return () => clearInterval(t);
  }, [loadConversations, numberFilter]);

  // SSE: mensaje entrante → refresco instantáneo de lista + hilo abierto
  // (mismo canal que ChatTab; si SSE falla, el polling de arriba cubre)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/admin/sse");
      es.addEventListener("wa_message_new", () => {
        void loadConversations();
        const phone = selectedRef.current;
        if (phone) void loadMessages(phone, false);
      });
    } catch {
      /* SSE no disponible — polling cubre */
    }
    return () => es?.close();
  }, [loadConversations, loadMessages]);

  // Poll del hilo abierto
  useEffect(() => {
    if (!selectedPhone) return;
    const t = setInterval(() => void loadMessages(selectedPhone, false), MSGS_POLL_MS);
    return () => clearInterval(t);
  }, [selectedPhone, loadMessages]);

  return {
    conversations,
    connection,
    numbers,
    numberFilter,
    setNumberFilter,
    loadingConvs,
    convsError,
    selectedPhone,
    selectConversation,
    messages,
    loadingMsgs,
    sendMessage,
    sendTemplate,
    sending,
    sendError,
    sendErrorCode,
    pausedPhones,
    toggleBotPause,
    archivedPhones,
    toggleArchive,
    customerContext,
    draftContact,
    startConversation,
    refresh: loadConversations,
  };
}
