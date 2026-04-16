"use client";

import { useState } from "react";
import { Link, Plus, Check, Pencil, Trash2, Send, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type Webhook = {
  id: string; name: string; url: string; events: string[]; active: boolean;
  secret: string; lastTriggered: string | null; successRate: number; totalCalls: number;
  method: "POST" | "GET"; headers: Record<string, string>;
};

const EVENTS = [
  "pedido.creado", "pedido.completado", "pedido.cancelado",
  "stock.bajo", "stock.agotado",
  "cliente.registrado", "cliente.compra",
  "pago.recibido", "pago.fallido",
  "backup.completado", "alerta.critica",
];

const SEED: Webhook[] = [];

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca"; }

export default function WebhooksTab() {
  const [webhooks, setWebhooks] = useState(SEED);
  const [showModal, setShowModal] = useState(false);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openCreate = () => { setEditWebhook(null); setFormName(""); setFormUrl(""); setFormEvents([]); setShowModal(true); };
  const openEdit = (wh: Webhook) => { setEditWebhook(wh); setFormName(wh.name); setFormUrl(wh.url); setFormEvents([...wh.events]); setShowModal(true); };

  const save = () => {
    if (!formName.trim() || !formUrl.trim()) return;
    if (editWebhook) {
      setWebhooks(prev => prev.map(w => w.id === editWebhook.id ? { ...w, name: formName, url: formUrl, events: formEvents } : w));
    } else {
      setWebhooks(prev => [...prev, { id: `wh${Date.now()}`, name: formName, url: formUrl, events: formEvents, active: true, secret: "whsec_new***", lastTriggered: null, successRate: 0, totalCalls: 0, method: "POST" as const, headers: { "Content-Type": "application/json" } }]);
    }
    setShowModal(false);
  };

  const toggleEvent = (ev: string) => { setFormEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]); };
  const activeCount = webhooks.filter(w => w.active).length;
  const totalCalls = webhooks.reduce((s, w) => s + w.totalCalls, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Link className="h-6 w-6 text-primary" /> Webhooks & APIs</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Configura integraciones externas con webhooks</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-4 w-4" /> Nuevo webhook</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Webhooks totales", value: webhooks.length, color: "text-emerald-500" },
          { label: "Activos", value: activeCount, color: "text-emerald-500" },
          { label: "Total llamadas", value: totalCalls.toLocaleString(), color: "text-violet-500" },
          { label: "Eventos disponibles", value: EVENTS.length, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {webhooks.map(wh => (
          <div key={wh.id} className={cn("bg-white dark:bg-card rounded-2xl border overflow-hidden transition-opacity", wh.active ? "border-gray-200 dark:border-card-border" : "border-gray-200 dark:border-card-border opacity-60")}>
            <button onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
              <div className="flex flex-wrap items-center gap-3 text-left">
                <div className={cn("h-3 w-3 rounded-full", wh.active ? "bg-emerald-500" : "bg-gray-400")} />
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{wh.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-muted font-mono truncate max-w-xs">{wh.url}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className={cn("text-xs font-bold", wh.successRate >= 95 ? "text-emerald-500" : wh.successRate >= 80 ? "text-amber-500" : "text-red-500")}>{wh.successRate}% éxito</p>
                  <p className="text-[10px] text-gray-400">{wh.totalCalls} llamadas</p>
                </div>
                <Eye className="h-4 w-4 text-gray-400" />
              </div>
            </button>

            {expandedId === wh.id && (
              <div className="px-5 pb-4 border-t border-gray-100 dark:border-card-border pt-3 space-y-3">
                <div className="flex flex-wrap gap-1">
                  {wh.events.map(ev => (
                    <span key={ev} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{ev}</span>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-gray-400">Método:</span> <b className="text-gray-700 dark:text-foreground">{wh.method}</b></div>
                  <div><span className="text-gray-400">Secret:</span> <b className="text-gray-700 dark:text-foreground font-mono">{wh.secret}</b></div>
                  <div><span className="text-gray-400">Último:</span> <b className="text-gray-700 dark:text-foreground">{fmtDate(wh.lastTriggered)}</b></div>
                  <div><span className="text-gray-400">Estado:</span> <b className={cn(wh.active ? "text-emerald-500" : "text-gray-400")}>{wh.active ? "Activo" : "Inactivo"}</b></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !w.active } : w))} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", wh.active ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200")}>{wh.active ? "Pausar" : "Activar"}</button>
                  <button onClick={() => openEdit(wh)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200"><Pencil className="h-3 w-3 inline mr-1" />Editar</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><Send className="h-3 w-3 inline mr-1" />Test</button>
                  <button onClick={() => setWebhooks(prev => prev.filter(w => w.id !== wh.id))} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200"><Trash2 className="h-3 w-3 inline mr-1" />Eliminar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-gray-200 dark:border-card-border max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">{editWebhook ? "Editar webhook" : "Nuevo webhook"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">URL</label><input value={formUrl} onChange={e => setFormUrl(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-mono" placeholder="https://..." /></div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted mb-2 block">Eventos</label>
                <div className="flex flex-wrap gap-1.5">
                  {EVENTS.map(ev => (
                    <button key={ev} onClick={() => toggleEvent(ev)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", formEvents.includes(ev) ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted")}>{ev}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
