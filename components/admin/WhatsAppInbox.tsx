"use client";

import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Search,
  Phone,
  User,
  Send,
  Loader2,
  RefreshCw,
  ArrowLeft,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Conversation = {
  phone: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

type ChatMessage = {
  id: string;
  customerPhone: string;
  customerName: string;
  sender: "customer" | "admin";
  message: string;
  read: boolean;
  createdAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) {
    return d.toLocaleDateString("es-PE", { weekday: "short" });
  }
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [errorConvs, setErrorConvs] = useState(false);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [search, setSearch] = useState("");
  const [inputMsg, setInputMsg] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cargar conversaciones ────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) throw new Error("error");
      const data: Conversation[] = await res.json();
      setConversations(data);
      setErrorConvs(false);
    } catch {
      setErrorConvs(true);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // ── Cargar mensajes de la conversación activa ────────────────────────────────

  const fetchMessages = useCallback(async (phone: string) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/chat?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error("error");
      const data: ChatMessage[] = await res.json();
      setMessages(data);
      // Marcar como leídos
      fetch("/api/chat/admin", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone }),
      }).catch((err) => console.warn("[WhatsAppInbox] mark-read failed:", err));
      // Actualizar badge en lista
      setConversations((prev) =>
        prev.map((c) => (c.phone === phone ? { ...c, unread: 0 } : c)),
      );
    } catch {
      // silencioso — el polling reintentará
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // ── Seleccionar conversación ─────────────────────────────────────────────────

  const selectConversation = useCallback(
    (conv: Conversation) => {
      setSelectedPhone(conv.phone);
      setSelectedName(conv.name);
      setMessages([]);
      fetchMessages(conv.phone);
    },
    [fetchMessages],
  );

  // ── Polling cada 10 segundos ─────────────────────────────────────────────────

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchConversations();
      if (selectedPhone) fetchMessages(selectedPhone);
    }, 10_000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchConversations, fetchMessages, selectedPhone]);

  // ── Scroll al último mensaje ─────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Enviar mensaje ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!selectedPhone || !inputMsg.trim() || sending) return;
    const text = inputMsg.trim();
    setInputMsg("");
    setSending(true);
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          phone: selectedPhone,
          customerName: selectedName,
          message: text,
        }),
      });
      if (res.ok) {
        const msg: ChatMessage = await res.json();
        setMessages((prev) => [...prev, msg]);
        // Actualizar último mensaje en lista
        setConversations((prev) =>
          prev.map((c) =>
            c.phone === selectedPhone
              ? { ...c, lastMessage: text, lastAt: new Date().toISOString() }
              : c,
          ),
        );
      }
    } catch {
      setInputMsg(text); // restaurar si falla
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────────

  const filtered = conversations.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[500px] overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
      {/* ── Columna izquierda: lista de chats ── */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-[var(--rule-base)] md:w-80 md:flex-shrink-0",
          selectedPhone && "hidden md:flex",
        )}
      >
        {/* Header lista */}
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-4 py-3 dark:border-[var(--rule-base)]">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="font-semibold text-[var(--text-primary)]">
              WhatsApp
            </span>
            {conversations.reduce((s, c) => s + c.unread, 0) > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                {conversations.reduce((s, c) => s + c.unread, 0)}
              </span>
            )}
          </div>
          <button
            onClick={fetchConversations}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)]"
            aria-label="Actualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Buscador */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-800">
            <Search className="h-4 w-4 flex-shrink-0 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Buscar nombre o teléfono"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] dark:text-gray-200"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <LoadingState />
          ) : errorConvs ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[var(--data-error-500)]">Error al cargar conversaciones</p>
              <button
                onClick={fetchConversations}
                className="mt-2 text-xs text-primary underline"
              >
                Reintentar
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <MessageSquare className="mx-auto mb-2 h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">No hay conversaciones aún</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.phone}
                onClick={() => selectConversation(conv)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-[var(--rule-soft)] px-4 py-3 text-left transition hover:bg-gray-50 dark:border-[var(--rule-base)] dark:hover:bg-gray-800",
                  selectedPhone === conv.phone &&
                    "bg-primary/10 dark:bg-primary/15",
                )}
              >
                {/* Avatar */}
                <div className="flex h-11 w-11 min-w-[44px] items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {getInitials(conv.name)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {conv.name}
                    </span>
                    <span className="flex-shrink-0 text-xs text-[var(--text-tertiary)]">
                      {formatTime(conv.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs text-[var(--text-tertiary)]">
                      {conv.lastMessage}
                    </span>
                    {conv.unread > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[length:var(--ts-xs)] font-bold text-white">
                        {conv.unread > 99 ? "99+" : conv.unread}
                      </span>
                    )}
                  </div>
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{conv.phone}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Columna derecha: conversación ── */}
      <div
        className={cn(
          "flex flex-1 flex-col",
          !selectedPhone && "hidden md:flex",
        )}
      >
        {!selectedPhone ? (
          // Empty state escritorio
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
            <MessageSquare className="h-16 w-16" />
            <p className="text-sm">Selecciona una conversación</p>
          </div>
        ) : (
          <>
            {/* Header conversación */}
            <div className="flex items-center gap-3 border-b border-[var(--rule-base)] px-4 py-3 dark:border-[var(--rule-base)]">
              {/* Botón volver (mobile) */}
              <button
                onClick={() => setSelectedPhone(null)}
                className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] md:hidden"
                aria-label="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {getInitials(selectedName)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--text-primary)]">
                  {selectedName}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">{selectedPhone}</p>
              </div>

              <div className="flex items-center gap-1">
                <a
                  href={`tel:${selectedPhone}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)]"
                  aria-label="Llamar"
                >
                  <Phone className="h-5 w-5" />
                </a>
                <a
                  href={`/admin/clientes?phone=${encodeURIComponent(selectedPhone)}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)]"
                  aria-label="Ver cliente"
                >
                  <User className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* Burbujas de mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loadingMsgs ? (
                <LoadingState />
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)]">
                  <MessageSquare className="mb-2 h-10 w-10 opacity-40" />
                  <p className="text-sm">Sin mensajes aún</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((msg) => {
                    const isAdmin = msg.sender === "admin";
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          isAdmin ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-xl px-4 py-2 text-sm ",
                            isAdmin
                              ? "rounded-br-sm bg-primary text-white"
                              : "rounded-bl-sm bg-gray-100 text-[var(--text-primary)] dark:bg-gray-700 dark:text-gray-100",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-right text-[length:var(--ts-2xs)]",
                              isAdmin ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]",
                            )}
                          >
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input de respuesta */}
            <div className="border-t border-[var(--rule-base)] px-4 py-3 dark:border-[var(--rule-base)]">
              <div className="flex items-end gap-2">
                <textarea
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje… (Enter para enviar)"
                  rows={1}
                  maxLength={500}
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--rule-base)] bg-gray-50 px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-primary focus:ring-1 focus:ring-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-[var(--text-secondary)]"
                  style={{ maxHeight: "120px", overflowY: "auto" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputMsg.trim() || sending}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Enviar mensaje"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {inputMsg.length}/500
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
