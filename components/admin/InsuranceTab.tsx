"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  Shield, Download, Search, Eye, X, AlertTriangle,
  CheckCircle2, Clock,
  XCircle,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PolicyType = "local" | "vehicular" | "responsabilidad" | "incendio" | "robo" | "salud" | "otro";
type PolicyStatus = "vigente" | "por-vencer" | "vencida";
type ClaimStatus = "abierto" | "en-revision" | "aprobado" | "rechazado";

type Policy = {
  id: string;
  type: PolicyType;
  insurer: string;
  policyNumber: string;
  coverage: string;
  monthlyPremium: number;
  startDate: string;
  endDate: string;
  status: PolicyStatus;
  daysToExpiry: number;
};

type Claim = {
  id: string;
  policyId: string;
  date: string;
  type: string;
  amount: number;
  status: ClaimStatus;
  resolution: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const TYPE_LABELS: Record<PolicyType, string> = {
  local: "Local Comercial", vehicular: "Vehicular", responsabilidad: "Responsabilidad Civil",
  incendio: "Incendio", robo: "Robo", salud: "Salud Colectiva", otro: "Otro",
};

const STATUS_META: Record<PolicyStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  vigente:    { label: "Vigente",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle2 },
  "por-vencer": { label: "Por Vencer", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",   icon: Clock },
  vencida:    { label: "Vencida",    color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",       icon: XCircle },
};

const CLAIM_STATUS: Record<ClaimStatus, { label: string; color: string; bg: string }> = {
  abierto:     { label: "Abierto",     color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  "en-revision": { label: "En Revisión", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  aprobado:    { label: "Aprobado",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  rechazado:   { label: "Rechazado",   color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const POLICIES: Policy[] = [];

const CLAIMS: Claim[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function InsuranceTab() {
  const [policies] = useState(POLICIES);
  const [claims] = useState(CLAIMS);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"policies" | "claims">("policies");
  const [detail, setDetail] = useState<Policy | null>(null);
  const [claimDetail, setClaimDetail] = useState<Claim | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return policies;
    const q = search.toLowerCase();
    return policies.filter(p => p.insurer.toLowerCase().includes(q) || p.policyNumber.toLowerCase().includes(q) || TYPE_LABELS[p.type].toLowerCase().includes(q));
  }, [policies, search]);

  const alerts = useMemo(() => policies.filter(p => p.status === "por-vencer" || p.status === "vencida"), [policies]);

  const stats = useMemo(() => {
    const vigentes = policies.filter(p => p.status === "vigente").length;
    const monthlyTotal = policies.filter(p => p.status !== "vencida").reduce((s, p) => s + p.monthlyPremium, 0);
    const claimsOpen = claims.filter(c => c.status === "abierto" || c.status === "en-revision").length;
    const claimsTotal = claims.reduce((s, c) => s + c.amount, 0);
    return { vigentes, monthlyTotal, claimsOpen, claimsTotal };
  }, [policies, claims]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Pólizas & Seguros
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Registro de pólizas, alertas de vencimiento y siniestros</p>
        </div>
        <button onClick={() => exportToCSV(policies.map(p => ({ tipo: TYPE_LABELS[p.type], aseguradora: p.insurer, poliza: p.policyNumber, cobertura: p.coverage, prima_mensual: p.monthlyPremium, inicio: p.startDate, fin: p.endDate, estado: STATUS_META[p.status].label })), "polizas-seguros")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pólizas vigentes", value: String(stats.vigentes), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Prima mensual total", value: fmt(stats.monthlyTotal), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Siniestros abiertos", value: String(stats.claimsOpen), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Monto total siniestros", value: fmt(stats.claimsTotal), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4 space-y-2">
          <p className="font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-sm flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Alertas de vencimiento</p>
          {alerts.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{TYPE_LABELS[a.type]} — {a.insurer} ({a.policyNumber})</span>
              <span className={cn("font-bold", a.status === "vencida" ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]")}>
                {a.status === "vencida" ? "VENCIDA" : `${a.daysToExpiry} días restantes`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([["policies", "Pólizas"], ["claims", "Siniestros"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold transition-colors", view === k ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent")}>
            {label}
          </button>
        ))}
      </div>

      {view === "policies" && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tipo, aseguradora, N° póliza..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
          </div>

          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Estado</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Tipo</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Aseguradora</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">N° Póliza</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Prima/mes</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Vencimiento</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {filtered.map(p => {
                    const st = STATUS_META[p.status];
                    const StIcon = st.icon;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                        <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}><StIcon className="h-3 w-3" />{st.label}</span></td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{TYPE_LABELS[p.type]}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{p.insurer}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] font-mono">{p.policyNumber}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(p.monthlyPremium)}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)]">{p.endDate}</td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(p)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"><Eye className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "claims" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Estado</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Fecha</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Póliza</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Tipo siniestro</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Monto</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {claims.map(c => {
                  const st = CLAIM_STATUS[c.status];
                  const pol = policies.find(p => p.id === c.policyId);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                      <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span></td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)]">{c.date}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono text-[var(--text-secondary)]">{pol?.policyNumber ?? "—"}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-primary)] dark:text-foreground">{c.type}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(c.amount)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setClaimDetail(c)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"><Eye className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policy detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm">{TYPE_LABELS[detail.type]}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Aseguradora", detail.insurer], ["N° Póliza", detail.policyNumber],
                ["Cobertura", detail.coverage], ["Prima mensual", fmt(detail.monthlyPremium)],
                ["Inicio", detail.startDate], ["Vencimiento", detail.endDate],
                ["Estado", STATUS_META[detail.status].label],
                ["Días restantes", detail.daysToExpiry > 0 ? `${detail.daysToExpiry} días` : "VENCIDA"],
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

      {/* Claim detail modal */}
      {claimDetail && (
        <div className="modal-backdrop p-4" onClick={() => setClaimDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm">Detalle del siniestro</CardTitle>
              <button onClick={() => setClaimDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Fecha", claimDetail.date], ["Tipo", claimDetail.type],
                ["Monto", fmt(claimDetail.amount)], ["Estado", CLAIM_STATUS[claimDetail.status].label],
                ["Resolución", claimDetail.resolution],
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
