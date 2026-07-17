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
  /** Media entrante — se sirve vía /api/admin/whatsapp/media/[mediaId]. */
  mediaId: string | null;
  mediaMime: string | null;
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

/** Mini-dashboard del día. */
export interface WaStats {
  recibidos: number;
  respondidos: number;
  porBot: number;
  porHumano: number;
  chatsActivos: number;
  respPromedioMin: number | null;
}

const SOUND_LS_KEY = "wa-inbox-sound";

/** Beep corto con WebAudio (sin assets) — notificación de mensaje nuevo. */
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    /* sin audio disponible — silencio */
  }
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
  // Etiquetas de triage por teléfono ({ phone: ["pedido","vip"] })
  const [labelsMap, setLabelsMap] = useState<Record<string, string[]>>({});
  // Anti-carrera: si el usuario tocó etiquetas hace <5s, el poll NO pisa el
  // estado optimista (el POST puede seguir en vuelo).
  const labelsTouchedAt = useRef(0);
  // Notas internas por teléfono (solo equipo)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const notesTouchedAt = useRef(0);
  // Mini-dashboard del día
  const [stats, setStats] = useState<WaStats | null>(null);
  // Sonido de mensaje nuevo (persistido)
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SOUND_LS_KEY);
      const on = v !== "0";
      setSoundOn(on);
      soundOnRef.current = on;
    } catch { /* default on */ }
  }, []);
  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      soundOnRef.current = next;
      try { localStorage.setItem(SOUND_LS_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);
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
        labelsMap?: Record<string, string[]>;
        notesMap?: Record<string, string>;
      };
      // Evitar pisar la lista si el usuario cambió el filtro durante el fetch
      if (numberFilterRef.current === filter) {
        setConversations(json.conversations);
        setNumbers(json.numbers ?? []);
        setConnection(json.connection);
        setPausedPhones(json.pausedPhones ?? []);
        setArchivedPhones(json.archivedPhones ?? []);
        if (Date.now() - labelsTouchedAt.current > 5000) {
          setLabelsMap(json.labelsMap ?? {});
        }
        if (Date.now() - notesTouchedAt.current > 5000) {
          setNotesMap(json.notesMap ?? {});
        }
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

  /** Guarda la nota interna de la conversación (vacía = borrar). */
  const saveNote = useCallback(async (phone: string, note: string) => {
    notesTouchedAt.current = Date.now();
    setNotesMap((prev) => {
      const next = { ...prev };
      if (!note.trim()) delete next[phone];
      else next[phone] = note.trim();
      return next;
    });
    try {
      const res = await tenantFetch("/api/admin/whatsapp/notes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone, note }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        notesMap?: Record<string, string>;
      };
      if (res.ok && json.notesMap) setNotesMap(json.notesMap);
    } catch {
      /* el próximo poll corrige */
    }
  }, []);

  /** Alterna una etiqueta de la conversación (optimista). */
  const toggleLabel = useCallback(
    async (phone: string, labelId: string) => {
      const current = labelsMap[phone] ?? [];
      const next = current.includes(labelId)
        ? current.filter((l) => l !== labelId)
        : [...current, labelId];
      labelsTouchedAt.current = Date.now();
      setLabelsMap((prev) => ({ ...prev, [phone]: next }));
      try {
        const res = await tenantFetch("/api/admin/whatsapp/labels", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ phone, labels: next }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          labelsMap?: Record<string, string[]>;
        };
        if (res.ok && json.labelsMap) setLabelsMap(json.labelsMap);
      } catch {
        /* el próximo poll corrige */
      }
    },
    [labelsMap],
  );

  /** "Dejar como no leída": resalta en la bandeja y cierra el hilo. */
  const markUnreadAndClose = useCallback(async (phone: string) => {
    setSelectedPhone(null);
    setMessages([]);
    setConversations((prev) =>
      prev.map((c) => (c.customerPhone === phone ? { ...c, unread: Math.max(1, c.unread) } : c)),
    );
    try {
      await tenantFetch("/api/admin/whatsapp/messages", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone, action: "unread" }),
      });
    } catch {
      /* el próximo poll corrige */
    }
  }, []);

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
  // + beep de notificación (toggle 🔔 persistido)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/admin/sse");
      es.addEventListener("wa_message_new", () => {
        if (soundOnRef.current) playBeep();
        void loadConversations();
        const phone = selectedRef.current;
        if (phone) void loadMessages(phone, false);
      });
    } catch {
      /* SSE no disponible — polling cubre */
    }
    return () => es?.close();
  }, [loadConversations, loadMessages]);

  // Mini-dashboard del día (refresco cada 60s — el server cachea igual)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await tenantFetch("/api/admin/whatsapp/stats");
        if (res.ok) setStats((await res.json()) as WaStats);
      } catch {
        /* best-effort */
      }
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, []);

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
    labelsMap,
    toggleLabel,
    markUnreadAndClose,
    notesMap,
    saveNote,
    stats,
    soundOn,
    toggleSound,
    customerContext,
    draftContact,
    startConversation,
    refresh: loadConversations,
  };
}
