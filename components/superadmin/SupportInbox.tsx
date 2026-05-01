"use client";

import { LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Mail,
  MailOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Send,
  X,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "closed";
type TicketPriority = "low" | "medium" | "high";

interface SupportTicket {
  id: string;
  subject: string;
  tenantName: string;
  tenantSlug: string;
  senderEmail: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  lastMessage: string;
  messages: TicketMessage[];
}

interface TicketMessage {
  id: string;
  from: "tenant" | "support";
  body: string;
  createdAt: string;
}

// ── Mock data (used when API is not available) ────────────────────────────────

const MOCK_TICKETS: SupportTicket[] = [
  {
    id: "t1",
    subject: "No puedo agregar productos nuevos",
    tenantName: "Bodega Don Pedro",
    tenantSlug: "don-pedro",
    senderEmail: "pedro@bodegadonpedro.com",
    status: "open",
    priority: "high",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    lastMessage: "Intento crear un producto y me sale error de limite.",
    messages: [
      {
        id: "m1",
        from: "tenant",
        body: "Hola, intento crear un producto nuevo pero me aparece un error que dice 'limite del plan alcanzado'. Ya borre productos viejos pero sigue igual. Pueden ayudarme?",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
  },
  {
    id: "t2",
    subject: "Consulta sobre dominio personalizado",
    tenantName: "Minimarket Selva",
    tenantSlug: "minimarket-selva",
    senderEmail: "maria@minimarketselva.pe",
    status: "in_progress",
    priority: "medium",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    lastMessage: "Ya configure el CNAME pero aun no aparece.",
    messages: [
      {
        id: "m2",
        from: "tenant",
        body: "Compre el plan Pro y quiero configurar mi dominio personalizado. Ya tengo el dominio comprado en Godaddy.",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "m3",
        from: "support",
        body: "Hola Maria! Para configurar tu dominio, ve a Configuracion > Plan y agrega tu dominio ahi. Luego en Godaddy crea un registro CNAME que apunte a bodegasaas.com.",
        createdAt: new Date(Date.now() - 82800000).toISOString(),
      },
      {
        id: "m4",
        from: "tenant",
        body: "Ya configure el CNAME pero aun no aparece. Puede tardar?",
        createdAt: new Date(Date.now() - 43200000).toISOString(),
      },
    ],
  },
  {
    id: "t3",
    subject: "Solicitud de factura",
    tenantName: "Abarrotes Luz",
    tenantSlug: "abarrotes-luz",
    senderEmail: "luz@abarrotesluz.com",
    status: "closed",
    priority: "low",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    lastMessage: "Perfecto, ya la recibi. Gracias!",
    messages: [
      {
        id: "m5",
        from: "tenant",
        body: "Necesito la factura del mes pasado para mi contador.",
        createdAt: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: "m6",
        from: "support",
        body: "Ya te enviamos la factura a tu correo. Revisa tu bandeja.",
        createdAt: new Date(Date.now() - 168000000).toISOString(),
      },
      {
        id: "m7",
        from: "tenant",
        body: "Perfecto, ya la recibi. Gracias!",
        createdAt: new Date(Date.now() - 162000000).toISOString(),
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: typeof Inbox }> = {
  open: { label: "Abierto", color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]", icon: Mail },
  in_progress: { label: "En progreso", color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]", icon: Clock },
  closed: { label: "Cerrado", color: "bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)]", icon: CheckCircle2 },
};

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: "text-gray-400",
  medium: "text-[var(--data-warning)]",
  high: "text-[var(--data-error)]",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupportInbox() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Fetch tickets (fallback to mock data)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/superadmin/support")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setTickets(Array.isArray(data) ? data : MOCK_TICKETS);
        }
      })
      .catch(() => {
        if (!cancelled) setTickets(MOCK_TICKETS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const filtered = tickets.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.subject.toLowerCase().includes(q) ||
        t.tenantName.toLowerCase().includes(q) ||
        t.senderEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleReply = useCallback(async () => {
    if (!reply.trim() || !selectedId) return;
    setSending(true);

    const newMessage: TicketMessage = {
      id: Date.now().toString(36),
      from: "support",
      body: reply.trim(),
      createdAt: new Date().toISOString(),
    };

    // Try API, fallback to local state
    try {
      await fetch(`/api/superadmin/support/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
    } catch {
      // silently continue with local update
    }

    setTickets((prev) =>
      prev.map((t) =>
        t.id === selectedId
          ? {
              ...t,
              messages: [...t.messages, newMessage],
              lastMessage: reply.trim(),
              status: "in_progress" as TicketStatus,
            }
          : t,
      ),
    );
    setReply("");
    setSending(false);
  }, [reply, selectedId]);

  const handleStatusChange = useCallback((ticketId: string, status: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status } : t)),
    );
    // Fire-and-forget API call
    fetch(`/api/superadmin/support/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[600px] bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
      {/* Ticket list (Gmail style) */}
      <div className={cn(
        "flex flex-col border-r border-[var(--rule-base)] dark:border-card-border",
        selected ? "hidden lg:flex lg:w-96" : "w-full",
      )}>
        {/* Header + filters */}
        <div className="p-3 border-b border-[var(--rule-base)] dark:border-card-border space-y-2">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-sm">Soporte</h2>
            <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
              {tickets.filter((t) => t.status !== "closed").length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tickets..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--rule-base)] bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "open", "in_progress", "closed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "text-[length:var(--ts-2xs)] font-semibold px-2 py-1 rounded-lg transition-colors",
                  filter === f
                    ? "bg-primary/10 text-primary"
                    : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5",
                )}
              >
                {f === "all" ? "Todos" : STATUS_CONFIG[f].label}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket rows */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              <MailOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No hay tickets
            </div>
          ) : (
            filtered.map((ticket) => {
              const statusCfg = STATUS_CONFIG[ticket.status];
              return (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                  className={cn(
                    "w-full text-left px-3 py-3 border-b border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors",
                    selectedId === ticket.id && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className={cn("w-3 h-3 shrink-0", PRIORITY_COLOR[ticket.priority])} />
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {ticket.subject}
                        </p>
                      </div>
                      <p className="text-[length:var(--ts-2xs)] text-gray-500 mt-0.5 truncate">
                        {ticket.tenantName} — {ticket.senderEmail}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5 truncate">
                        {ticket.lastMessage}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[length:var(--ts-2xs)] text-gray-400">{timeAgo(ticket.createdAt)}</span>
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full", statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Detail header */}
          <div className="p-4 border-b border-[var(--rule-base)] dark:border-card-border">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  {selected.subject}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.tenantName} &bull; {selected.senderEmail} &bull; {timeAgo(selected.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="lg:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-3">
              {selected.status !== "closed" && (
                <button
                  onClick={() => handleStatusChange(selected.id, "closed")}
                  className="text-[length:var(--ts-2xs)] font-semibold px-3 py-1.5 rounded-lg bg-[var(--data-success-50)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)] hover:opacity-80 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> Cerrar
                </button>
              )}
              {selected.status === "closed" && (
                <button
                  onClick={() => handleStatusChange(selected.id, "open")}
                  className="text-[length:var(--ts-2xs)] font-semibold px-3 py-1.5 rounded-lg bg-[var(--data-success-50)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)] hover:opacity-80 flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" /> Reabrir
                </button>
              )}
              <button
                onClick={() => handleStatusChange(selected.id, "in_progress")}
                className="text-[length:var(--ts-2xs)] font-semibold px-3 py-1.5 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)] hover:opacity-80 flex items-center gap-1"
              >
                <ArrowUpRight className="w-3 h-3" /> Escalar
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selected.messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-3",
                  msg.from === "tenant"
                    ? "bg-gray-100 dark:bg-white/5 mr-auto"
                    : "bg-primary/10 dark:bg-primary/15 ml-auto",
                )}
              >
                <p className="text-xs text-gray-800 dark:text-foreground whitespace-pre-wrap">
                  {msg.body}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-1.5">
                  {msg.from === "support" ? "Soporte" : selected.tenantName} &bull; {timeAgo(msg.createdAt)}
                </p>
              </div>
            ))}
          </div>

          {/* Reply box */}
          <div className="p-3 border-t border-[var(--rule-base)] dark:border-card-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReply();
                  }
                }}
                placeholder="Escribe una respuesta..."
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleReply}
                disabled={!reply.trim() || sending}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-400">
          <div className="text-center">
            <MailOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecciona un ticket</p>
            <p className="text-xs mt-1">para ver los detalles y responder</p>
          </div>
        </div>
      )}
    </div>
  );
}
