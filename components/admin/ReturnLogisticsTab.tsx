"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw, Package, AlertTriangle, Search, Download,
  ChevronDown, ChevronUp, BarChart3, Clock,
  CheckCircle2, XCircle, Truck, Eye,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

type ReturnStatus = "solicitada" | "aprobada" | "recogida" | "inspeccion" | "completada" | "rechazada";

type ReturnItem = { name: string; qty: number; price: number };

type Return = {
  id: string;
  orderId: string;
  customer: string;
  reason: string;
  items: ReturnItem[];
  status: ReturnStatus;
  requestDate: string;
  resolvedDate: string | null;
  refundAmount: number;
  notes: string;
};

const STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; step: number }> = {
  solicitada:  { label: "Solicitada",  color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",    step: 0 },
  aprobada:    { label: "Aprobada",    color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",          step: 1 },
  recogida:    { label: "En recojo",   color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",  step: 2 },
  inspeccion:  { label: "Inspección",  color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",  step: 3 },
  completada:  { label: "Completada",  color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]", step: 4 },
  rechazada:   { label: "Rechazada",   color: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",              step: -1 },
};

const TIMELINE_STEPS: { key: ReturnStatus; label: string; icon: typeof Clock }[] = [
  { key: "solicitada", label: "Solicitud",    icon: Clock },
  { key: "aprobada",   label: "Aprobación",   icon: CheckCircle2 },
  { key: "recogida",   label: "Recogida",     icon: Truck },
  { key: "inspeccion", label: "Inspección",   icon: Eye },
  { key: "completada", label: "Reembolso",    icon: CheckCircle2 },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function ReturnLogisticsTab() {
  const [returns, setReturns]         = useState<Return[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch]           = useState("");
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [view, setView]               = useState<"list" | "reasons">("list");

  useEffect(() => {
    let active = true;
    fetch("/api/returns").then(r => r.ok ? r.json() : []).then((data: Return[]) => {
      if (active) { setReturns(data); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    let list = returns;
    if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.customer.toLowerCase().includes(q) || r.orderId.toLowerCase().includes(q));
    }
    return list;
  }, [returns, filterStatus, search]);

  const kpis = useMemo(() => {
    const active      = returns.filter(r => !["completada", "rechazada"].includes(r.status)).length;
    const totalRefund = returns.filter(r => r.status === "completada").reduce((s, r) => s + r.refundAmount, 0);
    const returnRate  = returns.length > 0
      ? ((returns.length / Math.max(1, returns.length)) * 100).toFixed(1)
      : "0.0";
    const rejectedPct = returns.length > 0
      ? ((returns.filter(r => r.status === "rechazada").length / returns.length) * 100).toFixed(0)
      : "0";
    return { active, totalRefund, returnRate, rejectedPct };
  }, [returns]);

  // Reason frequency
  const reasonFreq = useMemo(() => {
    const map: Record<string, number> = {};
    returns.forEach(r => { map[r.reason] = (map[r.reason] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [returns]);

  const maxFreq = reasonFreq[0]?.[1] ?? 1;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" />
            Logística Inversa
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Devoluciones, recojos y reembolsos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["list", "reasons"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
              )}>
              {v === "list" ? "Devoluciones" : "Motivos"}
            </button>
          ))}
          <button
            onClick={() => exportToCSV(filtered.map(r => ({
              pedido: r.orderId, cliente: r.customer, razon: r.reason,
              estado: STATUS_CONFIG[r.status].label, monto: r.refundAmount,
              solicitud: r.requestDate, resolucion: r.resolvedDate ?? "-",
            })), "devoluciones")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Devoluciones activas", value: kpis.active,             color: "text-[var(--data-warning-500)]",   icon: RotateCcw },
          { label: "Total registradas",    value: returns.length,           color: "text-[var(--data-success-500)]",    icon: BarChart3 },
          { label: "Reembolsado (mes)",    value: fmt(kpis.totalRefund),    color: "text-[var(--data-error-500)]",     icon: XCircle },
          { label: "Tasa de rechazo",      value: `${kpis.rejectedPct}%`,   color: "text-[var(--text-secondary)]",  icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 flex items-start gap-3">
            <div className={cn("p-2 rounded-lg bg-gray-50 dark:bg-surface", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted leading-tight">{label}</p>
              <p className={cn("text-xl font-extrabold mt-0.5", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {view === "list" && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm"
                placeholder="Buscar por pedido o cliente…"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "solicitada", "aprobada", "recogida", "inspeccion", "completada", "rechazada"] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                    filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
                  )}>
                  {s === "all" ? "Todas" : STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Returns list */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted">No se encontraron devoluciones</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="w-full flex flex-wrap items-start justify-between gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.orderId}</span>
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", STATUS_CONFIG[r.status].color)}>
                        {STATUS_CONFIG[r.status].label}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] bg-gray-100 dark:bg-surface px-2 py-0.5 rounded-full">
                        {r.reason}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                      {r.customer} · {r.items.length} producto{r.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-[var(--data-error-500)]">{fmt(r.refundAmount)}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(r.requestDate)}</p>
                    </div>
                    {expandedId === r.id ? <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
                  </div>
                </button>

                {/* Expanded: timeline + items */}
                {expandedId === r.id && (
                  <div className="px-4 pb-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4 space-y-4">
                    {/* Timeline */}
                    {r.status !== "rechazada" && (
                      <div className="relative flex items-center gap-0">
                        {TIMELINE_STEPS.map((step, idx) => {
                          const stepNum = STATUS_CONFIG[r.status].step;
                          const done    = stepNum >= idx;
                          const current = stepNum === idx;
                          const Icon    = step.icon;
                          return (
                            <div key={step.key} className="flex items-center flex-1">
                              <div className="flex flex-col items-center">
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                                  done
                                    ? "bg-primary border-primary text-white"
                                    : current
                                    ? "bg-primary/10 border-primary text-[var(--accent-ink)] dark:text-[var(--accent)]"
                                    : "bg-gray-100 dark:bg-surface border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-tertiary)]"
                                )}>
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted mt-1 text-center leading-tight w-14">{step.label}</span>
                              </div>
                              {idx < TIMELINE_STEPS.length - 1 && (
                                <div className={cn("flex-1 h-0.5 mb-4", done ? "bg-primary" : "bg-gray-200 dark:bg-card-border")} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {r.status === "rechazada" && (
                      <div className="flex items-center gap-2 text-xs bg-[var(--data-error-50)] dark:bg-red-950/10 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-3 py-2 rounded-xl">
                        <XCircle className="h-3.5 w-3.5 shrink-0" /> Devolución rechazada
                      </div>
                    )}

                    {/* Items */}
                    <div className="flex flex-wrap gap-2">
                      {r.items.map((item, i) => (
                        <span key={i} className="text-[length:var(--ts-2xs)] bg-gray-50 dark:bg-surface px-2 py-1.5 rounded-lg text-[var(--text-secondary)] dark:text-muted border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                          {item.name} ×{item.qty} <span className="text-primary font-bold">({fmt(item.price)})</span>
                        </span>
                      ))}
                    </div>

                    {/* Notes */}
                    {r.notes && (
                      <div className="flex items-start gap-2 text-xs bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-3 py-2 rounded-xl">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {r.notes}
                      </div>
                    )}

                    {r.resolvedDate && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Resuelto el {fmtDate(r.resolvedDate)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {view === "reasons" && (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 sm:p-6 space-y-4">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">Motivos más frecuentes de devolución</CardTitle>
          {reasonFreq.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Sin datos todavía</p>
          ) : (
            <div className="space-y-3">
              {reasonFreq.map(([reason, count]) => (
                <div key={reason}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{reason}</span>
                    <span className="font-extrabold text-primary">{count} <span className="text-xs font-normal text-[var(--text-tertiary)]">({((count / returns.length) * 100).toFixed(0)}%)</span></span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(count / maxFreq) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
