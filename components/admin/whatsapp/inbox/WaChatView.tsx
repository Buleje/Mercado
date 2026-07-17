"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Bot, AlertCircle, MessageCircle, FileText, Zap, ShoppingBag, Paperclip, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import WaTemplatePicker from "./WaTemplatePicker";
import WaProductPicker from "./WaProductPicker";
import {
  PREDEFINED_QUICK_REPLIES,
  loadCustomQuickReplies,
  renderQuickReply,
} from "./quick-replies";
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
  /** Nombre del cliente — para armar respuestas rápidas ({nombre}). */
  customerName?: string;
  /** Teléfono del cliente — para pedir sugerencias IA del hilo. */
  customerPhone?: string;
  onSend: (body: string) => Promise<boolean>;
  onSendTemplate: (tpl: { name: string; language: string; params: string[] }) => Promise<boolean>;
  /** Compartir producto: imagen pública + caption con precio. */
  onSendImageLink: (link: string, caption: string) => Promise<boolean>;
  /** Adjuntar archivo del PC (imagen/PDF/audio). */
  onSendMediaFile: (file: File) => Promise<boolean>;
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
  customerName,
  customerPhone,
  onSend,
  onSendTemplate,
  onSendImageLink,
  onSendMediaFile,
}: Props) {
  const [draft, setDraft] = useState("");
  // Copiloto IA: 3 respuestas sugeridas on-demand (nunca se envían solas)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  async function fetchSuggestions() {
    if (!customerPhone || loadingSuggest) return;
    setLoadingSuggest(true);
    setSuggestions([]);
    try {
      const res = await tenantFetch("/api/admin/whatsapp/suggest", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: customerPhone }),
      });
      const json = (await res.json().catch(() => ({}))) as { suggestions?: string[] };
      if (res.ok && Array.isArray(json.suggestions)) setSuggestions(json.suggestions);
    } catch {
      /* sin sugerencias — el composer sigue normal */
    } finally {
      setLoadingSuggest(false);
    }
  }
  const [showTemplates, setShowTemplates] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Respuestas rápidas: predefinidas + custom del editor de Plantillas.
  // Las custom se recargan cada vez que se abre el panel (pueden editarse
  // en el sub-tab Plantillas sin recargar la página).
  const [quickReplies, setQuickReplies] = useState(PREDEFINED_QUICK_REPLIES);
  useEffect(() => {
    if (showQuick) {
      setQuickReplies([...loadCustomQuickReplies(), ...PREDEFINED_QUICK_REPLIES]);
    }
  }, [showQuick]);
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
    // flex-1 min-h-0 (NO h-full): comparte el main con el header del hilo;
    // h-full = 100% del main y desbordaba justo la altura del header.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mensajes (min-h-0: puede encogerse — el scroll es interno) */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
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
                  {/* Media: foto entrante (proxy) o enviada por URL (directa) */}
                  {m.mediaId && m.mediaMime?.startsWith("image/") && (() => {
                    const src = m.mediaId.startsWith("http")
                      ? m.mediaId
                      : `/api/admin/whatsapp/media/${m.mediaId}`;
                    return (
                      <a href={src} target="_blank" rel="noopener noreferrer" title="Ver foto completa">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={m.body || "Foto"}
                          loading="lazy"
                          className="mb-1 max-h-64 w-auto max-w-full rounded-xl"
                        />
                      </a>
                    );
                  })()}
                  {m.mediaId && m.mediaMime?.startsWith("audio/") && (
                     
                    <audio
                      controls
                      preload="none"
                      src={`/api/admin/whatsapp/media/${m.mediaId}`}
                      className="mb-1 h-10 w-64 max-w-full"
                    />
                  )}
                  {m.mediaId && m.mediaMime?.startsWith("video/") && (
                     
                    <video
                      controls
                      preload="none"
                      src={`/api/admin/whatsapp/media/${m.mediaId}`}
                      className="mb-1 max-h-64 w-auto max-w-full rounded-xl"
                    />
                  )}
                  {m.mediaId &&
                    m.mediaMime &&
                    !/^(image|audio|video)\//.test(m.mediaMime) && (
                      <a
                        href={`/api/admin/whatsapp/media/${m.mediaId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1 inline-block rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-primary underline underline-offset-2 dark:bg-slate-700"
                      >
                        📄 Abrir documento
                      </a>
                    )}
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
                    {failed && canSend && (
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void onSend(m.body)}
                        className="ml-1 font-bold text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-40"
                      >
                        Reintentar
                      </button>
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

      {/* Compartir producto del catálogo 🛒 */}
      {showProducts && (
        <WaProductPicker
          sending={sending}
          onSendImage={onSendImageLink}
          onInsertText={(text) => {
            setDraft(text);
            draftRef.current?.focus();
          }}
          onClose={() => setShowProducts(false)}
        />
      )}

      {/* Respuestas rápidas: un click y el texto queda en el composer */}
      {showQuick && (
        <div className="border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between px-4 pt-2.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
              <Zap className="h-4 w-4 text-primary" />
              Respuestas rápidas
            </p>
            <span className="text-[length:var(--ts-2xs)] text-slate-400">
              se editan en Plantillas WhatsApp
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto p-3">
            {quickReplies.map((q) => (
              <button
                key={q.id}
                type="button"
                title={q.texto}
                onClick={() => {
                  setDraft(renderQuickReply(q.texto, customerName));
                  setShowQuick(false);
                  draftRef.current?.focus();
                }}
                className="shrink-0 rounded-full border-2 border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary/60 hover:text-primary dark:border-slate-700 dark:text-slate-200"
              >
                {q.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sugerencias IA (click = queda en el composer para editar/enviar) */}
      {suggestions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 pt-2.5 dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setDraft(s);
                setSuggestions([]);
                draftRef.current?.focus();
              }}
              className="shrink-0 max-w-[280px] truncate rounded-full border-2 border-primary/40 bg-primary/5 px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={!canSend || loadingSuggest}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-primary/40 bg-primary/5 text-primary transition hover:bg-primary/10",
              (!canSend || loadingSuggest) && "cursor-not-allowed opacity-40",
            )}
            aria-label="Sugerir respuesta con IA"
            title="La IA lee el hilo y te propone 3 respuestas (vos elegís)"
          >
            {loadingSuggest ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => { setShowQuick((s) => !s); setShowTemplates(false); setShowProducts(false); }}
            disabled={!canSend}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 transition",
              showQuick
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-500 hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400",
              !canSend && "cursor-not-allowed opacity-40",
            )}
            aria-label="Respuestas rápidas"
            title="Respuestas rápidas (un click y queda en el mensaje)"
          >
            <Zap className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => { setShowProducts((s) => !s); setShowQuick(false); setShowTemplates(false); }}
            disabled={!canSend}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 transition",
              showProducts
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-500 hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400",
              !canSend && "cursor-not-allowed opacity-40",
            )}
            aria-label="Compartir producto"
            title="Compartir producto del catálogo (foto + precio)"
          >
            <ShoppingBag className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!canSend || sending}
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 text-slate-500 transition hover:border-primary/50 hover:text-primary dark:border-slate-700 dark:text-slate-400",
              (!canSend || sending) && "cursor-not-allowed opacity-40",
            )}
            aria-label="Adjuntar archivo"
            title="Adjuntar imagen, PDF o audio (máx 10MB)"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/ogg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // permitir re-adjuntar el mismo archivo
              if (f) void onSendMediaFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => { setShowTemplates((s) => !s); setShowQuick(false); setShowProducts(false); }}
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
            ref={draftRef}
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
