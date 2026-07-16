"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Bot, AlertCircle, MessageCircle, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import WaTemplatePicker from "./WaTemplatePicker";
import type { WaMessage } from "./useWhatsAppInbox";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
}

const SENT_BY_LABEL: Record<string, string> = { ai: "Bot IA", admin: "Tú" };

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  messages: WaMessage[];
  loading: boolean;
  canSend: boolean;
  sending: boolean;
  sendError: string | null;
  /** 131047 = fuera de ventana 24h → se sugiere plantilla. */
  sendErrorCode: number | null;
  /** Número del negocio del hilo (multi-número). */
  phoneNumberId: string | null;
  onSend: (body: string) => Promise<boolean>;
  onSendTemplate: (tpl: { name: string; language: string; params: string[] }) => Promise<boolean>;
}

/** Columna derecha del inbox: burbujas del hilo + composer + plantillas. */
export default function WaChatView({
  messages,
  loading,
  canSend,
  sending,
  sendError,
  sendErrorCode,
  phoneNumberId,
  onSend,
  onSendTemplate,
}: Props) {
  const [draft, setDraft] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // Auto-scroll solo cuando llegan mensajes nuevos (no en cada poll idéntico)
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  async function handleSend() {
    if (!draft.trim() || sending) return;
    const ok = await onSend(draft);
    if (ok) setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mensajes */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {loading && <p className="p-4 text-sm text-slate-500">Cargando mensajes…</p>}
        {!loading && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">Todavía no hay mensajes en este hilo.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const isOut = m.direction === "out";
          const prevDay = i > 0 ? dayOf(messages[i - 1].createdAt) : null;
          const day = dayOf(m.createdAt);
          const failed = m.status === "failed";
          return (
            <div key={m.id}>
              {day !== prevDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[length:var(--ts-xs)] font-semibold capitalize text-slate-600 dark:bg-slate-700/70 dark:text-slate-300">
                    {day}
                  </span>
                </div>
              )}
              <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 shadow-[var(--shadow-xs)]",
                    isOut
                      ? "rounded-br-md bg-primary/15 dark:bg-primary/25"
                      : "rounded-bl-md bg-white dark:bg-slate-800",
                    failed && "border-2 border-[var(--data-error-500)]",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-white">
                    {m.body}
                  </p>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[length:var(--ts-xs)] text-slate-500 dark:text-slate-400">
                    {isOut && m.sentBy === "ai" && <Bot className="h-3 w-3" aria-hidden />}
                    {isOut && (
                      <span className="font-semibold">{SENT_BY_LABEL[m.sentBy] ?? m.sentBy}</span>
                    )}
                    <span className="tabular-nums">{timeOf(m.createdAt)}</span>
                    {failed && (
                      <span className="font-bold text-[var(--data-error-500)]">· no se envió</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Error de envío (ventana 24h, token vencido, etc.) */}
      {sendError && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 py-2.5 dark:bg-[var(--data-error-500)]/10">
          <p className="flex items-start gap-2 text-sm font-medium text-[var(--data-error-500)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {sendError}
          </p>
          {sendErrorCode === 131047 && !showTemplates && (
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              <FileText className="h-4 w-4" />
              Usar plantilla
            </button>
          )}
        </div>
      )}

      {/* Plantillas aprobadas (única vía fuera de la ventana de 24h) */}
      {showTemplates && (
        <WaTemplatePicker
          phoneNumberId={phoneNumberId}
          sending={sending}
          onSend={onSendTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowTemplates((s) => !s)}
            disabled={!canSend}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 transition",
              showTemplates
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-500 hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400",
              !canSend && "cursor-not-allowed opacity-40",
            )}
            aria-label="Plantillas de WhatsApp"
            title="Plantillas aprobadas (para responder fuera de 24h)"
          >
            <FileText className="h-5 w-5" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={canSend ? "Escribe un mensaje…" : "Conecta tu número para responder"}
            disabled={!canSend || sending}
            rows={1}
            className="max-h-32 min-h-12 flex-1 resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend || sending || !draft.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
