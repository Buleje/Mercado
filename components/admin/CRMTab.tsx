"use client";

import { useState, useMemo } from "react";
import {
  Users, Download, Search, X,
  TrendingUp,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadStage = "lead" | "contactado" | "interesado" | "negociacion" | "ganado" | "perdido";
type Scoring = "hot" | "warm" | "cold";

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: LeadStage;
  scoring: Scoring;
  totalPurchases: number;
  totalSpent: number;
  lastPurchase: string;
  lastContact: string;
  notes: string;
  interactionCount: number;
  tasks: { text: string; dueDate: string; done: boolean }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STAGE_META: Record<LeadStage, { label: string; color: string; bg: string; order: number }> = {
  lead:        { label: "Lead",        color: "text-gray-500",    bg: "bg-gray-100 dark:bg-gray-800/30", order: 0 },
  contactado:  { label: "Contactado",  color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30", order: 1 },
  interesado:  { label: "Interesado",  color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30", order: 2 },
  negociacion: { label: "Negociación", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30", order: 3 },
  ganado:      { label: "Ganado",      color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", order: 4 },
  perdido:     { label: "Perdido",     color: "text-red-500",     bg: "bg-red-100 dark:bg-red-900/30", order: 5 },
};

const SCORING_META: Record<Scoring, { label: string; color: string; bg: string }> = {
  hot:  { label: "🔥 Hot",  color: "text-red-600",    bg: "bg-red-100 dark:bg-red-900/30" },
  warm: { label: "☀️ Warm", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  cold: { label: "❄️ Cold", color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Contact[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CRMTab() {
  const [contacts] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<LeadStage | "todos">("todos");
  const [filterScoring, setFilterScoring] = useState<Scoring | "todos">("todos");
  const [detail, setDetail] = useState<Contact | null>(null);

  const filtered = useMemo(() => {
    let list = [...contacts];
    if (filterStage !== "todos") list = list.filter(c => c.stage === filterStage);
    if (filterScoring !== "todos") list = list.filter(c => c.scoring === filterScoring);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    return list;
  }, [contacts, filterStage, filterScoring, search]);

  const stats = useMemo(() => {
    const pipeline = contacts.filter(c => !["ganado", "perdido"].includes(c.stage));
    const hotLeads = contacts.filter(c => c.scoring === "hot" && c.stage !== "perdido").length;
    const totalValue = contacts.reduce((s, c) => s + c.totalSpent, 0);
    const pendingTasks = contacts.reduce((s, c) => s + c.tasks.filter(t => !t.done).length, 0);
    return { pipeline: pipeline.length, hotLeads, totalValue, pendingTasks };
  }, [contacts]);

  // Pipeline view
  const pipeline = useMemo(() => {
    const stages: LeadStage[] = ["lead", "contactado", "interesado", "negociacion", "ganado"];
    return stages.map(s => ({ stage: s, contacts: contacts.filter(c => c.stage === s) }));
  }, [contacts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> CRM Avanzado
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Pipeline de ventas, scoring y seguimiento 360° de clientes</p>
        </div>
        <button onClick={() => exportToCSV(contacts.map(c => ({ nombre: c.name, email: c.email, telefono: c.phone, etapa: STAGE_META[c.stage].label, scoring: c.scoring, compras: c.totalPurchases, gastado: c.totalSpent, ultima_compra: c.lastPurchase })), "crm-contactos")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "En pipeline", value: String(stats.pipeline), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Leads hot", value: String(stats.hotLeads), color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Valor total clientes", value: fmt(stats.totalValue), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Tareas pendientes", value: String(stats.pendingTasks), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Kanban */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Pipeline de ventas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {pipeline.map(p => {
            const meta = STAGE_META[p.stage];
            return (
              <div key={p.stage} className={cn("rounded-xl p-3 space-y-2", meta.bg)}>
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs font-bold", meta.color)}>{meta.label}</p>
                  <span className={cn("text-xs font-extrabold", meta.color)}>{p.contacts.length}</span>
                </div>
                {p.contacts.map(c => (
                  <button key={c.id} onClick={() => setDetail(c)} className="w-full text-left bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg p-2 hover:shadow transition-shadow">
                    <p className="text-xs font-bold text-gray-800 dark:text-foreground truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.scoring === "hot" ? "🔥" : c.scoring === "warm" ? "☀️" : "❄️"} {fmt(c.totalSpent)}</p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters + list */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, email..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value as LeadStage | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las etapas</option>
          {(Object.keys(STAGE_META) as LeadStage[]).map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
        </select>
        <select value={filterScoring} onChange={e => setFilterScoring(e.target.value as Scoring | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todo scoring</option>
          <option value="hot">🔥 Hot</option><option value="warm">☀️ Warm</option><option value="cold">❄️ Cold</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(c => {
          const stg = STAGE_META[c.stage];
          return (
            <div key={c.id} onClick={() => setDetail(c)} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-2 hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-gray-900 dark:text-foreground">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.email}</p>
                </div>
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", stg.bg, stg.color)}>{stg.label}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-muted">{SCORING_META[c.scoring].label}</span>
                <span className="font-bold text-emerald-600">{fmt(c.totalSpent)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{c.totalPurchases} compras</span>
                <span>{c.interactionCount} interacciones</span>
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.name}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Email", detail.email], ["Teléfono", detail.phone],
                ["Etapa", STAGE_META[detail.stage].label], ["Scoring", SCORING_META[detail.scoring].label],
                ["Compras", String(detail.totalPurchases)], ["Gastado", fmt(detail.totalSpent)],
                ["Última compra", detail.lastPurchase], ["Último contacto", detail.lastContact],
                ["Interacciones", String(detail.interactionCount)],
              ].map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
            </div>
            {detail.notes && (
              <div><p className="text-xs text-gray-400 mb-1">Notas</p><p className="text-sm text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface rounded-xl p-3">{detail.notes}</p></div>
            )}
            {detail.tasks.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Tareas</p>
                {detail.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs mb-1">
                    <span className={t.done ? "text-emerald-500" : "text-amber-500"}>{t.done ? "✅" : "⏳"}</span>
                    <span className={cn("flex-1", t.done && "line-through text-gray-400")}>{t.text}</span>
                    <span className="text-gray-400">{t.dueDate}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
