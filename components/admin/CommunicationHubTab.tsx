"use client";

import { useState, useMemo } from "react";
import { MessageSquare, Phone, Mail, Search, Filter, Send, Clock, AlertTriangle, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Message = {
  id: string; customer: string; channel: "whatsapp" | "sms" | "email" | "llamada"; direction: "in" | "out";
  content: string; timestamp: string; status: "enviado" | "leido" | "respondido" | "pendiente";
  agent: string | null; category: string;
};

const CHANNEL_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  sms: { label: "SMS", icon: Phone, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  email: { label: "Email", icon: Mail, color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  llamada: { label: "Llamada", icon: Phone, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

const SEED: Message[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
function fmtFull(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function CommunicationHubTab() {
  const [messages] = useState(SEED);
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const filtered = useMemo(() => {
    let list = messages;
    if (filterChannel !== "all") list = list.filter(m => m.channel === filterChannel);
    if (filterStatus !== "all") list = list.filter(m => m.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.customer.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
    }
    return list;
  }, [messages, filterChannel, filterStatus, search]);

  const pendingCount = messages.filter(m => m.status === "pendiente").length;
  const todayCount = messages.filter(m => m.timestamp.startsWith("2025-07-13")).length;
  const inbound = messages.filter(m => m.direction === "in").length;
  const outbound = messages.filter(m => m.direction === "out").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><MessageSquare className="h-6 w-6 text-primary" /> Hub de Comunicaciones</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Bandeja unificada: WhatsApp, SMS, email y llamadas</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(m => ({ cliente: m.customer, canal: m.channel, dir: m.direction, mensaje: m.content, estado: m.status, fecha: fmtFull(m.timestamp) })), "comunicaciones")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Mensajes hoy", value: todayCount, color: "text-emerald-500" },
          { label: "Pendientes", value: pendingCount, color: "text-red-500" },
          { label: "Entrantes", value: inbound, color: "text-emerald-500" },
          { label: "Salientes", value: outbound, color: "text-violet-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-3 text-center">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar por cliente o contenido…" />
        </div>
        <div className="flex items-center gap-1.5">
          {["all", "whatsapp", "sms", "email", "llamada"].map(c => (
            <button key={c} onClick={() => setFilterChannel(c)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterChannel === c ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{c === "all" ? "Todos" : CHANNEL_CONFIG[c].label}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Filter className="h-4 w-4 text-gray-400" />
        {["all", "pendiente", "enviado", "leido", "respondido"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todos" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(m => {
          const Ch = CHANNEL_CONFIG[m.channel];
          const Icon = Ch.icon;
          return (
            <div key={m.id} className={cn("bg-white dark:bg-card rounded-xl border p-4", m.status === "pendiente" ? "border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/5" : "border-gray-200 dark:border-card-border")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", Ch.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-sm text-gray-900 dark:text-foreground">{m.customer}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", m.direction === "in" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted")}>{m.direction === "in" ? "← Entrante" : "→ Saliente"}</span>
                    <span className="text-[10px] text-gray-400 bg-gray-50 dark:bg-surface px-1.5 py-0.5 rounded">{m.category}</span>
                    {m.status === "pendiente" && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" /> Pendiente</span>}
                    <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmtDate(m.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-muted">{m.content}</p>
                  {m.agent && <p className="text-[10px] text-gray-400 mt-1">Agente: {m.agent}</p>}

                  {replyTo === m.id && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs" placeholder="Escribe tu respuesta…" />
                      <button onClick={() => { setReplyTo(null); setReplyText(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90"><Send className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
                {m.direction === "in" && m.status !== "respondido" && (
                  <button onClick={() => setReplyTo(replyTo === m.id ? null : m.id)} className="px-2 py-1 rounded-lg text-xs font-bold text-primary hover:bg-primary/10">Responder</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
