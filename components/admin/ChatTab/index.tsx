"use client";

import { PageTitle } from "@buleje/design-system";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, AlertCircle, XCircle, ReceiptText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { fmtSoles } from "@/lib/chat/shared-product";
import { orderStatusMeta, type ChatOrderContext } from "@/lib/chat/order-context";
import { ThreadsList } from "./ThreadsList";
import { ConversationView } from "./ConversationView";
import { MessageComposer } from "./MessageComposer";
import { LabelPicker } from "./LabelPicker";
import { useChatThreads, useChatMessages, type MsgReplySnapshot } from "./hooks";
import { STATUS_LABELS } from "./types";
import { useSettingsSafe } from "@/contexts/settings-context";

/** "hace un momento · hace 5 min · hace 2 h · hace 3 d" para "Visto …". */
function relativeSeen(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

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
  // Tanda 3: nombre de la tienda para la variable {tienda} de plantillas.
  const settings = useSettingsSafe();
  const storeName = settings?.businessName || undefined;
  // Tanda 4: contexto del pedido fijado (se carga al abrir el hilo, no en poll).
  const [orderContext, setOrderContext] = useState<ChatOrderContext | null>(null);

  useEffect(() => {
    if (!selectedThreadId) { setOrderContext(null); return; }
    let cancelled = false;
    setOrderContext(null);
    tenantFetch(`/api/admin/chat/threads/${encodeURIComponent(selectedThreadId)}/order`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setOrderContext((j?.data as ChatOrderContext | null) ?? null); })
      .catch(() => { /* contexto del pedido es best-effort: si falla, no se fija */ });
    return () => { cancelled = true; };
  }, [selectedThreadId]);

  const {
    threads,
    loading: threadsLoading,
    error: threadsError,
    statusFilter,
    setStatusFilter,
    closeThread,
    setLabels,
  } = useChatThreads("open");

  const {
    messages,
    loading: messagesLoading,
    sendMessage,
    react,
    pingTyping,
    shareProduct,
    proposeSubstitution,
    sendOrder,
    sendPayment,
    suggestReplies,
    presence,
  } = useChatMessages(selectedThreadId);

  // Increment 2b: cita activa del composer del vendedor.
  const [replyTo, setReplyTo] = useState<MsgReplySnapshot | null>(null);

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5 dark:border-slate-700">
        <div>
          <PageTitle className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <MessageCircle className="h-6 w-6 text-primary" />
            Chat con clientes
          </PageTitle>
          <p className="text-xs text-slate-500">
            Mensajes de tus clientes desde la tienda. Cuando no estés en línea,
            reciben respuesta automática por WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
            <MessageCircle className="h-3.5 w-3.5" />
            {threads.length} hilos
          </span>
          {totalUnread > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-500)] px-3 py-1 font-semibold text-white">
              {totalUnread} sin leer
            </span>
          )}
          {threadsError && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-100)] px-3 py-1 font-semibold text-[var(--data-error-500)]">
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
                {/* Increment 2b: presencia del cliente */}
                {presence && (presence.typing || presence.online || presence.lastSeen) && (
                  <div
                    className={cn(
                      "text-[length:var(--ts-2xs)] font-semibold",
                      presence.typing ? "text-primary" : "text-[var(--data-success-500)]",
                    )}
                  >
                    {presence.typing
                      ? "Escribiendo…"
                      : presence.online
                        ? "En línea"
                        : `Visto ${relativeSeen(presence.lastSeen!)}`}
                  </div>
                )}
                {selectedThread.customerPhone && (
                  <div className="text-[length:var(--ts-xs)] text-slate-500">
                    <a
                      href={`tel:${selectedThread.customerPhone}`}
                      className="underline underline-offset-2 hover:text-primary"
                    >
                      {selectedThread.customerPhone}
                    </a>
                  </div>
                )}
                {/* Tanda 3: etiquetas de triage del hilo */}
                <LabelPicker
                  value={selectedThread.labels ?? []}
                  onChange={(labels) => setLabels(selectedThread.id, labels)}
                />
              </div>
              {selectedThread.status === "open" && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--data-error-500)] px-2.5 py-1 text-xs font-semibold text-[var(--data-error-500)] transition hover:bg-[var(--data-error-50)]"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cerrar
                </button>
              )}
            </div>
          )}

          {/* Tanda 4: contexto del pedido fijado arriba de la conversación */}
          {selectedThread && orderContext && (
            <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <ReceiptText className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Pedido #{orderContext.shortCode}
                </span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold",
                  orderStatusMeta(orderContext.status).chip,
                )}>
                  {orderStatusMeta(orderContext.status).label}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-[length:var(--ts-xs)] text-slate-500 dark:text-slate-400">
                  {orderContext.items.map((it) => `${it.quantity}× ${it.name}`).join(" · ")}
                  {orderContext.itemCount > orderContext.items.reduce((a, i) => a + i.quantity, 0) && " …"}
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-primary">
                  {fmtSoles(orderContext.total)}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <ConversationView
              messages={messages}
              loading={messagesLoading}
              onReact={react}
              onReply={setReplyTo}
              emptyState={
                selectedThread
                  ? "Todavía no hay mensajes en esta conversación"
                  : "Elige una conversación de la lista"
              }
            />
          </div>

          {selectedThread && selectedThread.status === "open" && (
            <MessageComposer
              onSend={sendMessage}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onTyping={pingTyping}
              onShareProduct={shareProduct}
              onProposeSubstitution={proposeSubstitution}
              onSendOrder={sendOrder}
              onSendPayment={sendPayment}
              onSuggest={suggestReplies}
              customerName={selectedThread.customerName}
              storeName={storeName}
            />
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
