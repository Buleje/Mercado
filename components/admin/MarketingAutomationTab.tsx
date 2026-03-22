"use client";

import { useState, useMemo } from "react";
import {
  Megaphone, Download, Search, Eye, X,
  Mail, Smartphone, Users,
  BarChart3,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignType = "email" | "sms" | "push" | "mixto";
type CampaignStatus = "borrador" | "activa" | "pausada" | "completada" | "cancelada";
type TriggerType = "manual" | "cumpleaños" | "abandono-carrito" | "inactividad" | "primera-compra" | "recurrente";

type Campaign = {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  trigger: TriggerType;
  segment: string;
  sentCount: number;
  openRate: number;
  clickRate: number;
  conversions: number;
  revenue: number;
  cost: number;
  startDate: string;
  endDate: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
const pct = (n: number) => n.toFixed(1) + "%";

const TYPE_META: Record<CampaignType, { label: string; icon: typeof Mail; color: string }> = {
  email: { label: "Email", icon: Mail, color: "text-blue-600" },
  sms:   { label: "SMS",   icon: Smartphone, color: "text-emerald-600" },
  push:  { label: "Push",  icon: Megaphone, color: "text-violet-600" },
  mixto: { label: "Mixto", icon: Users, color: "text-amber-600" },
};

const STATUS_META: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  borrador:   { label: "Borrador",   color: "text-gray-500",    bg: "bg-gray-100 dark:bg-gray-800/30" },
  activa:     { label: "Activa",     color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  pausada:    { label: "Pausada",    color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  completada: { label: "Completada", color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  cancelada:  { label: "Cancelada",  color: "text-red-500",     bg: "bg-red-100 dark:bg-red-900/30" },
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual: "Manual", "cumpleaños": "Cumpleaños", "abandono-carrito": "Abandono Carrito",
  inactividad: "Inactividad (30d)", "primera-compra": "Post 1ra Compra", recurrente: "Recurrente Semanal",
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Campaign[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarketingAutomationTab() {
  const [campaigns] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CampaignStatus | "todos">("todos");
  const [filterType, setFilterType] = useState<CampaignType | "todos">("todos");
  const [detail, setDetail] = useState<Campaign | null>(null);

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (filterStatus !== "todos") list = list.filter(c => c.status === filterStatus);
    if (filterType !== "todos") list = list.filter(c => c.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.segment.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, filterStatus, filterType, search]);

  const stats = useMemo(() => {
    const active = campaigns.filter(c => c.status === "activa").length;
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalCost = campaigns.reduce((s, c) => s + c.cost, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
    return { active, totalRevenue, totalConversions, roi };
  }, [campaigns]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Marketing Automation
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Campañas automáticas, segmentación y seguimiento de ROI</p>
        </div>
        <button onClick={() => exportToCSV(campaigns.map(c => ({ nombre: c.name, tipo: TYPE_META[c.type].label, estado: STATUS_META[c.status].label, trigger: TRIGGER_LABELS[c.trigger], enviados: c.sentCount, apertura: c.openRate, clicks: c.clickRate, conversiones: c.conversions, revenue: c.revenue, costo: c.cost })), "marketing-campañas")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Campañas activas", value: String(stats.active), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Revenue total", value: fmt(stats.totalRevenue), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Conversiones", value: stats.totalConversions.toLocaleString("es-PE"), color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
          { label: "ROI campañas", value: pct(stats.roi), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, segmento..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as CampaignStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as CampaignStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as CampaignType | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as CampaignType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Campaña</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Tipo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Trigger</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Enviados</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Apertura</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Clicks</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Conv.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Revenue</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-sm">Sin campañas.</td></tr>}
              {filtered.map(c => {
                const st = STATUS_META[c.status];
                const tp = TYPE_META[c.type];
                const TpIcon = tp.icon;
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-gray-800 dark:text-foreground text-xs">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.segment}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("inline-flex items-center gap-1 text-xs font-semibold", tp.color)}><TpIcon className="h-3 w-3" />{tp.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500">{TRIGGER_LABELS[c.trigger]}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-700 dark:text-foreground">{c.sentCount.toLocaleString("es-PE")}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-gray-500">{pct(c.openRate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-gray-500">{pct(c.clickRate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-emerald-600">{c.conversions}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-700 dark:text-foreground">{fmt(c.revenue)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"><Eye className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-3">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Embudo de conversión (campañas activas)</h3>
        {(() => {
          const active = campaigns.filter(c => c.status === "activa");
          const totalSent = active.reduce((s, c) => s + c.sentCount, 0);
          const totalOpened = active.reduce((s, c) => s + Math.round(c.sentCount * c.openRate / 100), 0);
          const totalClicked = active.reduce((s, c) => s + Math.round(c.sentCount * c.clickRate / 100), 0);
          const totalConv = active.reduce((s, c) => s + c.conversions, 0);
          const steps = [
            { label: "Enviados", value: totalSent, color: "bg-blue-500" },
            { label: "Abiertos", value: totalOpened, color: "bg-violet-500" },
            { label: "Clicks", value: totalClicked, color: "bg-amber-500" },
            { label: "Conversiones", value: totalConv, color: "bg-emerald-500" },
          ];
          return (
            <div className="space-y-2">
              {steps.map(s => {
                const w = totalSent > 0 ? (s.value / totalSent) * 100 : 0;
                return (
                  <div key={s.label} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-gray-600 dark:text-muted">{s.label}</span><span className="font-bold text-gray-800 dark:text-foreground">{s.value.toLocaleString("es-PE")}</span></div>
                    <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden"><div className={cn("h-full rounded-full", s.color)} style={{ width: `${Math.max(w, 2)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">{detail.name}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Tipo", TYPE_META[detail.type].label], ["Estado", STATUS_META[detail.status].label],
                ["Trigger", TRIGGER_LABELS[detail.trigger]], ["Segmento", detail.segment],
                ["Enviados", detail.sentCount.toLocaleString("es-PE")],
                ["Tasa apertura", pct(detail.openRate)], ["Tasa clicks", pct(detail.clickRate)],
                ["Conversiones", String(detail.conversions)], ["Revenue", fmt(detail.revenue)],
                ["Costo", fmt(detail.cost)],
                ["ROI", detail.cost > 0 ? pct(((detail.revenue - detail.cost) / detail.cost) * 100) : "—"],
                ["Inicio", detail.startDate], ["Fin", detail.endDate ?? "En curso"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-gray-500 dark:text-muted shrink-0">{k}</span>
                  <span className="font-semibold text-gray-800 dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
