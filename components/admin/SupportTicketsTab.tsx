"use client";

import { useState, useMemo } from "react";
import {
  MessageSquare, Download, Search, Eye, X,
  AlertTriangle,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketPriority = "critica" | "alta" | "media" | "baja";
type TicketStatus = "abierto" | "en-progreso" | "resuelto" | "cerrado" | "escalado";
type TicketSource = "pedido" | "chat" | "email" | "telefono" | "presencial";

type Ticket = {
  id: string;
  number: string;
  date: string;
  clientName: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: TicketSource;
  assignedTo: string;
  slaHours: number;
  elapsedHours: number;
  slaBreached: boolean;
  satisfaction: number | null; // 1-5 or null
  messages: number;
  orderRef?: string;
  resolution?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_META: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  critica: { label: "Crítica",  color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
  alta:    { label: "Alta",     color: "text-orange-600",  bg: "bg-orange-100 dark:bg-orange-900/30" },
  media:   { label: "Media",    color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  baja:    { label: "Baja",     color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
};

const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  abierto:       { label: "Abierto",     color: "text-blue-600" },
  "en-progreso": { label: "En progreso", color: "text-amber-600" },
  resuelto:      { label: "Resuelto",    color: "text-emerald-600" },
  cerrado:       { label: "Cerrado",     color: "text-gray-500" },
  escalado:      { label: "Escalado",    color: "text-red-600" },
};

const SOURCE_META: Record<TicketSource, string> = {
  pedido: "📦 Pedido", chat: "💬 Chat", email: "📧 Email", telefono: "📞 Teléfono", presencial: "🏪 Presencial",
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Ticket[] = [];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ: { q: string; a: string }[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupportTicketsTab() {
  const [tickets] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<TicketPriority | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "todos">("todos");
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [showFaq, setShowFaq] = useState(false);

  const filtered = useMemo(() => {
    let list = [...tickets];
    if (filterPriority !== "todos") list = list.filter(t => t.priority === filterPriority);
    if (filterStatus !== "todos") list = list.filter(t => t.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.clientName.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.number.toLowerCase().includes(q));
    }
    return list;
  }, [tickets, filterPriority, filterStatus, search]);

  const stats = useMemo(() => {
    const open = tickets.filter(t => ["abierto", "en-progreso", "escalado"].includes(t.status)).length;
    const breached = tickets.filter(t => t.slaBreached).length;
    const resolved = tickets.filter(t => ["resuelto", "cerrado"].includes(t.status));
    const avgSatisfaction = resolved.filter(t => t.satisfaction !== null).reduce((s, t) => s + (t.satisfaction || 0), 0) / Math.max(resolved.filter(t => t.satisfaction !== null).length, 1);
    const avgResolutionTime = resolved.reduce((s, t) => s + t.elapsedHours, 0) / Math.max(resolved.length, 1);
    return { open, breached, avgSatisfaction, avgResolutionTime, total: tickets.length };
  }, [tickets]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> Soporte & Tickets
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de tickets, SLA, base de conocimiento y satisfacción</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFaq(!showFaq)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">FAQ</button>
          <button onClick={() => exportToCSV(tickets.map(t => ({ numero: t.number, fecha: t.date, cliente: t.clientName, asunto: t.subject, prioridad: PRIORITY_META[t.priority].label, estado: STATUS_META[t.status].label, fuente: t.source, asignado: t.assignedTo, sla_hrs: t.slaHours, transcurrido: t.elapsedHours, sla_breach: t.slaBreached ? "Sí" : "No", satisfaccion: t.satisfaction ?? "—" })), "soporte-tickets")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tickets abiertos", value: String(stats.open), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "SLA incumplido", value: String(stats.breached), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Satisfacción prom.", value: `${stats.avgSatisfaction.toFixed(1)} ⭐`, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Tiempo resolución prom.", value: `${stats.avgResolutionTime.toFixed(1)}h`, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {stats.breached > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Hay {stats.breached} ticket(s) con SLA incumplido</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">Priorizar resolución inmediata para mantener la calidad de servicio.</p>
          </div>
        </div>
      )}

      {/* FAQ Panel */}
      {showFaq && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5">
          <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground mb-3">📚 Base de conocimiento (FAQ)</h3>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <div key={i} className="bg-gray-50 dark:bg-surface rounded-xl p-3">
                <p className="text-sm font-bold text-gray-800 dark:text-foreground">{f.q}</p>
                <p className="text-sm text-gray-600 dark:text-muted mt-1">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, asunto, número..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as TicketPriority | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las prioridades</option>
          {(Object.keys(PRIORITY_META) as TicketPriority[]).map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as TicketStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as TicketStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Tickets table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Ticket</th><th className="px-2 sm:px-4 py-2 sm:py-3">Cliente</th><th className="px-2 sm:px-4 py-2 sm:py-3">Asunto</th><th className="px-2 sm:px-4 py-2 sm:py-3">Prioridad</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3">SLA</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{t.number}<br/><span className="text-gray-400">{t.date}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">{t.clientName}<br/><span className="text-xs text-gray-400">{SOURCE_META[t.source]}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground max-w-[200px] truncate">{t.subject}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", PRIORITY_META[t.priority].bg, PRIORITY_META[t.priority].color)}>{PRIORITY_META[t.priority].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold", STATUS_META[t.status].color)}>{STATUS_META[t.status].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs">
                    <span className={cn("font-bold", t.slaBreached ? "text-red-600" : "text-emerald-600")}>{t.elapsedHours}h / {t.slaHours}h</span>
                    {t.slaBreached && <span className="block text-red-500 text-[10px]">⚠️ Incumplido</span>}
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(t)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5 inline" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.number}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-foreground">{detail.subject}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ["Cliente", detail.clientName], ["Fuente", SOURCE_META[detail.source]],
                ["Prioridad", PRIORITY_META[detail.priority].label], ["Estado", STATUS_META[detail.status].label],
                ["Asignado a", detail.assignedTo], ["Mensajes", String(detail.messages)],
                ["SLA", `${detail.elapsedHours}h / ${detail.slaHours}h`], ["SLA cumplido", detail.slaBreached ? "No ⚠️" : "Sí ✅"],
                ...(detail.orderRef ? [["Pedido relacionado", detail.orderRef]] : []),
                ...(detail.satisfaction !== null ? [["Satisfacción", "⭐".repeat(detail.satisfaction)]] : []),
              ].map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
            </div>
            {detail.resolution && (
              <div><p className="text-xs text-gray-400 mb-1">Resolución</p><p className="text-sm text-gray-700 dark:text-foreground bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3">{detail.resolution}</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
