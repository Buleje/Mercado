"use client";

import { useState, useEffect, useCallback } from "react";
import { Field } from '@/components/admin/shared/Field';
import { MessageCircleQuestion, X, Send, ChevronDown, Loader2, CheckCircle, Circle, MessageSquare } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high";
type TicketStatus = "open" | "replied" | "closed";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  priority: Priority;
  status: TicketStatus;
  reply?: string | null;
  createdAt: string;
  updatedAt: string;
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
  medium: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
  high: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  replied: "Respondido",
  closed: "Cerrado",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"form" | "list">("form");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  // Contar tickets abiertos sin leer (open o replied)
  const unreadCount = tickets.filter((t) => t.status === "open" || t.status === "replied").length;

  // ── Cargar tickets ──────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/support/tickets");
      if (res.ok) {
        const json = await res.json();
        setTickets(json.tickets ?? []);
      }
    } catch {
      // silencioso — widget no crítico
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadTickets();
  }, [open, loadTickets]);

  // ── Crear ticket ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subject.trim() || !message.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/support/tickets", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ subject: subject.trim(), message: message.trim(), priority }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error?.message ?? json?.error ?? "Error al enviar");
        }
        setSubmitted(true);
        setSubject("");
        setMessage("");
        setPriority("medium");
        // Recargar lista después de crear
        await loadTickets();
        setTimeout(() => { setSubmitted(false); setView("list"); }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setSubmitting(false);
      }
    },
    [subject, message, priority, loadTickets],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Botón flotante */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative flex items-center gap-2 px-4 py-3 rounded-full transition-all",
            "bg-primary hover:bg-[#255c44] text-white text-sm font-medium",
            open && "bg-[#255c44]",
          )}
          aria-label="Soporte"
        >
          {open ? <X className="w-4 h-4" /> : <MessageCircleQuestion className="w-4 h-4" />}
          <span className="hidden sm:inline">{open ? "Cerrar" : "¿Necesitas ayuda?"}</span>
          {!open && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--data-error-500)] text-white text-xs flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel lateral */}
      <div
        className={cn(
          "fixed bottom-20 right-6 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-xl",
          "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
          "transition-all duration-[var(--dur-base)] origin-bottom-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
          <div className="flex gap-2">
            <button
              onClick={() => setView("form")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                view === "form"
                  ? "bg-primary text-white"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Nuevo ticket
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "relative px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                view === "list"
                  ? "bg-primary text-white"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Mis tickets
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
          <button onClick={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)]">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 max-h-[420px] overflow-y-auto">

          {/* Vista: Formulario */}
          {view === "form" && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Asunto" labelClassName="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="¿En qué podemos ayudarte?"
                  maxLength={200}
                  required
                  className="w-full text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-sunken)] px-3 py-2 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Mensaje" labelClassName="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe tu problema con detalle..."
                  rows={4}
                  maxLength={2000}
                  required
                  className="w-full text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-sunken)] px-3 py-2 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </Field>
              <div>
                <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Prioridad</span>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                        priority === p
                          ? PRIORITY_COLORS[p] + " border-transparent"
                          : "border-[var(--rule-base)] text-[var(--text-tertiary)]",
                      )}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
              )}

              {submitted ? (
                <div className="flex items-center gap-2 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Ticket enviado correctamente
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                    "bg-primary hover:bg-[#255c44] text-white",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? "Enviando..." : "Enviar ticket"}
                </button>
              )}
            </form>
          )}

          {/* Vista: Lista de tickets */}
          {view === "list" && (
            <div className="space-y-3">
              {loadingTickets ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-tertiary)]" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[var(--text-tertiary)]">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No tienes tickets aún</p>
                  <button
                    onClick={() => setView("form")}
                    className="mt-2 text-xs text-primary dark:text-[var(--data-success-500)] hover:underline"
                  >
                    Crear el primero
                  </button>
                </div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">{t.subject}</p>
                      <span className={cn("flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium", PRIORITY_COLORS[t.priority])}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === "open" ? (
                        <Circle className="w-3 h-3 text-[var(--data-warning-500)]" />
                      ) : t.status === "replied" ? (
                        <CheckCircle className="w-3 h-3 text-[var(--data-success-500)]" />
                      ) : (
                        <CheckCircle className="w-3 h-3 text-[var(--text-tertiary)]" />
                      )}
                      <span className="text-xs text-[var(--text-tertiary)]">{STATUS_LABELS[t.status]}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">·</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(t.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {t.reply && (
                      <div className="mt-1 text-xs text-[var(--text-secondary)] bg-primary/10 dark:bg-primary/15 rounded p-2 border-l-2 border-[var(--data-success-500)]/30">
                        <span className="font-medium text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Respuesta: </span>
                        {t.reply}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
