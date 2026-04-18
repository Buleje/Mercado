"use client";

import { PageTitle } from "@buleje/design-system";
import { useMemo, useState } from "react";
import { MessageCircle, AlertCircle, XCircle } from "@buleje/design-system/icons";
import { ThreadsList } from "./ThreadsList";
import { ConversationView } from "./ConversationView";
import { MessageComposer } from "./MessageComposer";
import { useChatThreads, useChatMessages } from "./hooks";
import { STATUS_LABELS } from "./types";

/**
 * ChatTab — panel admin del Bloque D2 del Marketplace (chat buyer ↔ seller).
 *
 * Layout responsive:
 *   Desktop: 2 columnas → ThreadsList (320px) · ConversationView + Composer
 *   Mobile:  tabs → lista o conversación (no ambas)
 *
 * Polling: threads cada 8s, messages cada 5s. Auto-markAsRead al abrir.
 */
export default function ChatTab() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const {
    threads,
    loading: threadsLoading,
    error: threadsError,
    statusFilter,
    setStatusFilter,
    closeThread,
  } = useChatThreads("open");

  const {
    messages,
    loading: messagesLoading,
    sendMessage,
  } = useChatMessages(selectedThreadId);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const totalUnread = useMemo(
    () => threads.reduce((acc, t) => acc + t.unreadForSeller, 0),
    [threads],
  );

  async function handleClose() {
    if (!selectedThread) return;
    const reason = window.prompt("Motivo del cierre (opcional):");
    if (reason === null) return; // canceló
    try {
      await closeThread(selectedThread.id, reason.trim() || undefined);
      setSelectedThreadId(null);
    } catch {
      window.alert("No se pudo cerrar la conversación.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div>
          <PageTitle className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <MessageCircle className="h-6 w-6 text-[#00B4A6]" />
            Chat con clientes
          </PageTitle>
          <p className="text-xs text-slate-500">
            Bloque D2 del Marketplace · polling 5-8s · los clientes reciben respuesta automática
            por WhatsApp cuando estás ausente
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#00B4A6]/10 px-3 py-1 font-semibold text-[#00B4A6]">
            <MessageCircle className="h-3.5 w-3.5" />
            {threads.length} hilos
          </span>
          {totalUnread > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error)] px-3 py-1 font-semibold text-white">
              {totalUnread} sin leer
            </span>
          )}
          {threadsError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-100)] px-3 py-1 font-semibold text-[var(--data-error)]">
              <AlertCircle className="h-3.5 w-3.5" />
              error
            </span>
          )}
        </div>
      </header>

      {/* Main 2-column layout */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        {/* Threads list */}
        <aside className="border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
          <ThreadsList
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
            loading={threadsLoading}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </aside>

        {/* Conversation view + composer */}
        <main className="flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900/20">
          {selectedThread && (
            <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedThread.customerName}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] uppercase text-slate-400">
                    {STATUS_LABELS[selectedThread.status]}
                  </span>
                </div>
                {selectedThread.customerPhone && (
                  <div className="text-[length:var(--ts-xs)] text-slate-500">
                    <a
                      href={`tel:${selectedThread.customerPhone}`}
                      className="underline underline-offset-2 hover:text-[#00B4A6]"
                    >
                      {selectedThread.customerPhone}
                    </a>
                  </div>
                )}
              </div>
              {selectedThread.status === "open" && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--data-error)] px-2.5 py-1 text-xs font-semibold text-[var(--data-error)] transition hover:bg-[var(--data-error-50)]"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cerrar
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <ConversationView
              messages={messages}
              loading={messagesLoading}
              emptyState={
                selectedThread
                  ? "Todavía no hay mensajes en esta conversación"
                  : "Elegí una conversación de la lista"
              }
            />
          </div>

          {selectedThread && selectedThread.status === "open" && (
            <MessageComposer onSend={sendMessage} />
          )}
          {selectedThread && selectedThread.status !== "open" && (
            <div className="border-t border-slate-200 bg-slate-100 p-3 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              Esta conversación está {STATUS_LABELS[selectedThread.status].toLowerCase()} · no se
              pueden enviar mensajes
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
