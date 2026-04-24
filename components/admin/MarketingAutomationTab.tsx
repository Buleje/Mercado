"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";

import { useState, useMemo } from "react";
import {
  Megaphone, Download, Search, Eye, X,
  Mail, Smartphone, Users,
  BarChart3,
} from "@buleje/design-system/icons";
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
  email: { label: "Email", icon: Mail, color: "text-[var(--data-success)]" },
  sms:   { label: "SMS",   icon: Smartphone, color: "text-[var(--data-success)]" },
  push:  { label: "Push",  icon: Megaphone, color: "text-[var(--text-secondary)]" },
  mixto: { label: "Mixto", icon: Users, color: "text-[var(--data-warning)]" },
};

const STATUS_META: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  borrador:   { label: "Borrador",   color: "text-[var(--text-secondary)]",    bg: "bg-[var(--surface-sunken)]/30" },
  activa:     { label: "Activa",     color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  pausada:    { label: "Pausada",    color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30" },
  completada: { label: "Completada", color: "text-[var(--data-success)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  cancelada:  { label: "Cancelada",  color: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30" },
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
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Marketing Automation
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Campañas automáticas, segmentación y seguimiento de ROI</p>
        </div>
        <button onClick={() => exportToCSV(campaigns.map(c => ({ nombre: c.name, tipo: TYPE_META[c.type].label, estado: STATUS_META[c.status].label, trigger: TRIGGER_LABELS[c.trigger], enviados: c.sentCount, apertura: c.openRate, clicks: c.clickRate, conversiones: c.conversions, revenue: c.revenue, costo: c.cost })), "marketing-campañas")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Campañas activas", value: String(stats.active), color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Revenue total", value: fmt(stats.totalRevenue), color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Conversiones", value: stats.totalConversions.toLocaleString("es-PE"), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "ROI campañas", value: pct(stats.roi), color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, segmento..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as CampaignStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as CampaignStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as CampaignType | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as CampaignType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Campaña</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Tipo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Trigger</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Enviados</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Apertura</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Clicks</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Conv.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Revenue</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin campañas.</td></tr>}
              {filtered.map(c => {
                const st = STATUS_META[c.status];
                const tp = TYPE_META[c.type];
                const TpIcon = tp.icon;
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground text-xs">{c.name}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.segment}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("inline-flex items-center gap-1 text-xs font-semibold", tp.color)}><TpIcon className="h-3 w-3" />{tp.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)]">{TRIGGER_LABELS[c.trigger]}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{c.sentCount.toLocaleString("es-PE")}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-secondary)]">{pct(c.openRate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--text-secondary)]">{pct(c.clickRate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-success)]">{c.conversions}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(c.revenue)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(c)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"><Eye className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-3">
        <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Embudo de conversión (campañas activas)</CardTitle>
        {(() => {
          const active = campaigns.filter(c => c.status === "activa");
          const totalSent = active.reduce((s, c) => s + c.sentCount, 0);
          const totalOpened = active.reduce((s, c) => s + Math.round(c.sentCount * c.openRate / 100), 0);
          const totalClicked = active.reduce((s, c) => s + Math.round(c.sentCount * c.clickRate / 100), 0);
          const totalConv = active.reduce((s, c) => s + c.conversions, 0);
          const steps = [
            { label: "Enviados", value: totalSent, color: "bg-[var(--accent-soft)]" },
            { label: "Abiertos", value: totalOpened, color: "bg-[var(--text-primary)]" },
            { label: "Clicks", value: totalClicked, color: "bg-[var(--data-warning)]" },
            { label: "Conversiones", value: totalConv, color: "bg-[var(--accent-soft)]" },
          ];
          return (
            <div className="space-y-2">
              {steps.map(s => {
                const w = totalSent > 0 ? (s.value / totalSent) * 100 : 0;
                return (
                  <div key={s.label} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-[var(--text-secondary)] dark:text-muted">{s.label}</span><span className="font-bold text-[var(--text-primary)] dark:text-foreground">{s.value.toLocaleString("es-PE")}</span></div>
                    <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden"><div className={cn("h-full rounded-full", s.color)} style={{ width: `${Math.max(w, 2)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm">{detail.name}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
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
                  <span className="text-[var(--text-secondary)] dark:text-muted shrink-0">{k}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
