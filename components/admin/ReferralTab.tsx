"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  Heart, Download, Search, Eye, X, Star,
  Copy, CheckCircle2,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReferralStatus = "activo" | "canjeado" | "expirado" | "pendiente";

type Referral = {
  id: string;
  referrerName: string;
  referrerCode: string;
  referredName: string;
  referredDate: string;
  status: ReferralStatus;
  rewardType: "descuento" | "saldo" | "producto";
  rewardValue: string;
  referredPurchases: number;
  referredSpent: number;
  converted: boolean;
};

type TopReferrer = {
  name: string;
  code: string;
  totalReferred: number;
  totalConverted: number;
  totalRevenue: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_META: Record<ReferralStatus, { label: string; color: string; bg: string }> = {
  activo:    { label: "Activo",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  canjeado:  { label: "Canjeado",  color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  expirado:  { label: "Expirado",  color: "text-[var(--text-secondary)]",    bg: "bg-[var(--surface-sunken)]/30" },
  pendiente: { label: "Pendiente", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const REFERRALS: Referral[] = [];

const TOP_REFERRERS: TopReferrer[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReferralTab() {
  const [referrals] = useState(REFERRALS);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ReferralStatus | "todos">("todos");
  const [detail, setDetail] = useState<Referral | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...referrals];
    if (filterStatus !== "todos") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.referrerName.toLowerCase().includes(q) || r.referredName.toLowerCase().includes(q) || r.referrerCode.toLowerCase().includes(q));
    }
    return list;
  }, [referrals, filterStatus, search]);

  const stats = useMemo(() => {
    const totalReferred = referrals.length;
    const converted = referrals.filter(r => r.converted).length;
    const conversionRate = totalReferred > 0 ? ((converted / totalReferred) * 100) : 0;
    const totalRevenue = referrals.reduce((s, r) => s + r.referredSpent, 0);
    const activeReferrers = new Set(referrals.map(r => r.referrerCode)).size;
    return { totalReferred, converted, conversionRate, totalRevenue, activeReferrers };
  }, [referrals]);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Heart className="h-6 w-6 text-[var(--text-secondary)]" /> Programa de Referidos
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Códigos, recompensas, conversión y ranking de referidores</p>
        </div>
        <button onClick={() => exportToCSV(referrals.map(r => ({ referidor: r.referrerName, codigo: r.referrerCode, referido: r.referredName, fecha: r.referredDate, estado: STATUS_META[r.status].label, tipo_recompensa: r.rewardType, valor: r.rewardValue, compras: r.referredPurchases, gastado: r.referredSpent })), "referidos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total referidos", value: String(stats.totalReferred), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Convertidos", value: `${stats.converted} (${stats.conversionRate.toFixed(0)}%)`, color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Ingresos generados", value: fmt(stats.totalRevenue), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Referidores activos", value: String(stats.activeReferrers), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Top Referrers */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5">
        <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 mb-3"><Star className="h-4 w-4 text-[var(--data-warning-500)]" /> Ranking de referidores</CardTitle>
        <div className="space-y-2">
          {TOP_REFERRERS.map((tr, i) => (
            <div key={tr.code} className="flex flex-wrap items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
              <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold", i === 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]" : i === 1 ? "bg-gray-200 text-[var(--text-secondary)] dark:bg-gray-700 dark:text-[var(--text-tertiary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]")}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground truncate">{tr.name}</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono text-primary">{tr.code}</span>
                  <button onClick={() => handleCopy(tr.code)} className="text-[var(--text-tertiary)] hover:text-primary">{copiedCode === tr.code ? <CheckCircle2 className="h-3 w-3 text-[var(--data-success-500)]" /> : <Copy className="h-3 w-3" />}</button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{tr.totalConverted}/{tr.totalReferred}</p>
                <p className="text-xs text-[var(--data-success-500)] font-bold">{fmt(tr.totalRevenue)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + list */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, código..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReferralStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as ReferralStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Referidor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Código</th><th className="px-2 sm:px-4 py-2 sm:py-3">Referido</th><th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th><th className="px-2 sm:px-4 py-2 sm:py-3">Recompensa</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{r.referrerName}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-primary text-xs">{r.referrerCode}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-primary)] dark:text-foreground">{r.referredName}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)]">{r.referredDate}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs"><span className="font-bold text-[var(--text-secondary)]">{r.rewardValue}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_META[r.status].bg, STATUS_META[r.status].color)}>{STATUS_META[r.status].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(r)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5 inline" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.referrerName} → {detail.referredName}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Código", detail.referrerCode], ["Fecha", detail.referredDate], ["Recompensa", detail.rewardValue], ["Tipo", detail.rewardType], ["Estado", STATUS_META[detail.status].label], ["Convertido", detail.converted ? "Sí" : "No"], ["Compras del referido", String(detail.referredPurchases)], ["Gastado", fmt(detail.referredSpent)]].map(([k, v]) => (
                <div key={k}><p className="text-xs text-[var(--text-tertiary)]">{k}</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{v}</p></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
