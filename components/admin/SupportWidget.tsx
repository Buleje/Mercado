"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircleQuestion, X, Send, ChevronDown, Loader2, CheckCircle, Circle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

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
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
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
          headers: { "Content-Type": "application/json" },
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
            "bg-[#00B4A6] hover:bg-[#255c44] text-white text-sm font-medium",
            open && "bg-[#255c44]",
          )}
          aria-label="Soporte"
        >
          {open ? <X className="w-4 h-4" /> : <MessageCircleQuestion className="w-4 h-4" />}
          <span className="hidden sm:inline">{open ? "Cerrar" : "¿Necesitas ayuda?"}</span>
          {!open && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Panel lateral */}
      <div
        className={cn(
          "fixed bottom-20 right-6 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-xl",
          "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
          "transition-all duration-200 origin-bottom-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-2">
            <button
              onClick={() => setView("form")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                view === "form"
                  ? "bg-[#00B4A6] text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
              )}
            >
              Nuevo ticket
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "relative px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                view === "list"
                  ? "bg-[#00B4A6] text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
              )}
            >
              Mis tickets
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 max-h-[420px] overflow-y-auto">

          {/* Vista: Formulario */}
          {view === "form" && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Asunto</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="¿En qué podemos ayudarte?"
                  maxLength={200}
                  required
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mensaje</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe tu problema con detalle..."
                  rows={4}
                  maxLength={2000}
                  required
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prioridad</label>
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
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400",
                      )}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              {submitted ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Ticket enviado correctamente
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                    "bg-[#00B4A6] hover:bg-[#255c44] text-white",
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
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No tienes tickets aún</p>
                  <button
                    onClick={() => setView("form")}
                    className="mt-2 text-xs text-[#00B4A6] dark:text-emerald-400 hover:underline"
                  >
                    Crear el primero
                  </button>
                </div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{t.subject}</p>
                      <span className={cn("flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium", PRIORITY_COLORS[t.priority])}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === "open" ? (
                        <Circle className="w-3 h-3 text-amber-500" />
                      ) : t.status === "replied" ? (
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <CheckCircle className="w-3 h-3 text-gray-400" />
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABELS[t.status]}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(t.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {t.reply && (
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 bg-emerald-50 dark:bg-emerald-900/20 rounded p-2 border-l-2 border-emerald-400">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Respuesta: </span>
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
