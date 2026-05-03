"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  X,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { TableSkeleton, type CommissionEntry, type CommissionSummary } from "../types";

// ── Helpers ─────────────────────────────────────────────────────────────────

const COMMISSIONS_LAST_PAID_KEY = "marketplace:commissions:last-paid-snapshot";

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]",     icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-[var(--accent-soft)] text-[var(--data-success)]",     icon: CheckCircle },
};

function sumCommissionsInMonth(entries: CommissionEntry[], status: string, offsetMonths: number): number {
  const ref = new Date();
  ref.setDate(1);
  ref.setMonth(ref.getMonth() + offsetMonths);
  const y = ref.getFullYear(), m = ref.getMonth();
  return entries
    .filter((e) => e.status === status)
    .filter((e) => {
      const d = new Date(e.createdAt);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
}

function estimatePayoutDate(createdAt: string): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 7);
  return d;
}

function fmtMoney(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDelta(curr: number, prev: number): { label: string; tone: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { label: "—", tone: "flat" };
  if (prev === 0) return { label: "+nuevo", tone: "up" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { label: "0%", tone: "flat" };
  return { label: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, tone: pct > 0 ? "up" : "down" };
}

function CommissionKpiCard({
  label, total, monthCurr, monthPrev, tone, icon: Icon,
}: {
  label: string;
  total: number;
  monthCurr: number;
  monthPrev: number;
  tone: "warning" | "success" | "info";
  icon: React.ElementType;
}) {
  const delta = fmtDelta(monthCurr, monthPrev);
  const palette: Record<typeof tone, { ring: string; text: string }> = {
    warning: { ring: "bg-[var(--data-warning-50)]",  text: "text-[var(--data-warning)]" },
    success: { ring: "bg-[var(--accent-soft)]",      text: "text-[var(--data-success)]" },
    info:    { ring: "bg-blue-50",                   text: "text-blue-700" },
  };
  const p = palette[tone];
  return (
    <div className={cn("rounded-xl p-4 border border-[var(--rule-base)]", p.ring)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p>
          <p className={cn("text-2xl font-extrabold mt-1", p.text)}>{fmtMoney(total)}</p>
        </div>
        <span className="h-8 w-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className="text-[var(--text-secondary)]">Mes actual: <strong>{fmtMoney(monthCurr)}</strong></span>
        <span className={cn("px-1.5 py-0.5 rounded-full font-bold text-[length:var(--ts-2xs)]",
          delta.tone === "up" ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
            : delta.tone === "down" ? "bg-[var(--data-error-100)] text-[var(--data-error)]"
            : "bg-gray-100 text-[var(--text-secondary)]"
        )} title={`vs mes anterior (${fmtMoney(monthPrev)})`}>
          {delta.label}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ComisionesTab
// ─────────────────────────────────────────────
export default function ComisionesTab() {
  const [entries, setEntries]   = useState<CommissionEntry[]>([]);
  const [summary, setSummary]   = useState<CommissionSummary>({ pendiente: 0, liquidado: 0, pagado: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [newlyPaid, setNewlyPaid] = useState<CommissionEntry[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/commissions/ledger")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const list: CommissionEntry[] = Array.isArray(d?.entries) ? d.entries : [];
        setEntries(list);
        const s: CommissionSummary = { pendiente: 0, liquidado: 0, pagado: 0 };
        list.forEach((e) => { s[e.status] = (s[e.status] || 0) + e.amount; });
        setSummary(s);

        try {
          const raw = window.localStorage.getItem(COMMISSIONS_LAST_PAID_KEY);
          const prev: string[] = raw ? JSON.parse(raw) : [];
          const prevSet = new Set(prev);
          const currentlyPaid = list.filter((e) => e.status === "pagado");
          const fresh = currentlyPaid.filter((e) => !prevSet.has(e.id));
          if (prev.length > 0 && fresh.length > 0) setNewlyPaid(fresh);
          window.localStorage.setItem(COMMISSIONS_LAST_PAID_KEY, JSON.stringify(currentlyPaid.map((e) => e.id)));
        } catch { /* localStorage bloqueado */ }
      })
      .catch(() => setError("No se pudieron cargar las comisiones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (entryId: string) => {
    setMarkingPaid(entryId);
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [entryId], status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "pagado" } : e));
      setSummary((prev) => {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return prev;
        return { ...prev, [entry.status]: prev[entry.status as keyof CommissionSummary] - entry.amount, pagado: prev.pagado + entry.amount };
      });
    } catch {
      setError("Error al marcar como pagado.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleBulkPay = async () => {
    const settledIds = entries.filter((e) => e.status === "liquidado").map((e) => e.id);
    if (settledIds.length === 0) return;
    setMarkingPaid("bulk");
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: settledIds, status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("Error al marcar comisiones como pagadas.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const filtered = filterStatus === "all" ? entries : entries.filter((e) => e.status === filterStatus);

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CommissionKpiCard label="Por pagar (pendiente)" total={summary.pendiente}
          monthCurr={sumCommissionsInMonth(entries, "pendiente", 0)} monthPrev={sumCommissionsInMonth(entries, "pendiente", -1)}
          tone="warning" icon={Clock} />
        <CommissionKpiCard label="Liquidado (por cobrar)" total={summary.liquidado}
          monthCurr={sumCommissionsInMonth(entries, "liquidado", 0)} monthPrev={sumCommissionsInMonth(entries, "liquidado", -1)}
          tone="info" icon={DollarSign} />
        <CommissionKpiCard label="Pagado (cobrado)" total={summary.pagado}
          monthCurr={sumCommissionsInMonth(entries, "pagado", 0)} monthPrev={sumCommissionsInMonth(entries, "pagado", -1)}
          tone="success" icon={CheckCircle} />
      </div>

      {/* Calendario de próximos pagos */}
      {entries.filter((e) => e.status === "liquidado").length > 0 && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Próximos pagos</CardTitle>
            <span className="text-xs text-[var(--text-secondary)]">· estimado +7 días tras liquidación</span>
          </div>
          <ul className="divide-y divide-[var(--rule-base)]">
            {entries.filter((e) => e.status === "liquidado")
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .slice(0, 5)
              .map((e) => {
                const payDate = estimatePayoutDate(e.createdAt);
                const daysLeft = Math.ceil((payDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                          {payDate.toLocaleDateString("es-PE", { day: "2-digit", month: "long" })}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {daysLeft <= 0 ? "ya disponible para cobrar" : daysLeft === 1 ? "en 1 día" : `en ${daysLeft} días`}
                          {" · "}orden #{e.orderId.slice(-8).toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-extrabold text-[var(--data-success)] whitespace-nowrap">{fmtMoney(Number(e.amount))}</span>
                  </li>
                );
              })}
          </ul>
          {entries.filter((e) => e.status === "liquidado").length > 5 && (
            <p className="text-xs text-[var(--text-tertiary)] mt-2 text-center">
              +{entries.filter((e) => e.status === "liquidado").length - 5} lote(s) más adelante
            </p>
          )}
        </div>
      )}

      {/* Toast de nuevos pagos */}
      {newlyPaid.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--data-success)]/40 bg-[var(--accent-soft)]">
          <CheckCircle className="h-5 w-5 text-[var(--data-success)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {newlyPaid.length === 1 ? "1 lote pagado nuevo" : `${newlyPaid.length} lotes pagados nuevos`}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Recibiste {fmtMoney(newlyPaid.reduce((s, e) => s + Number(e.amount), 0))} desde tu última visita.
            </p>
          </div>
          <button onClick={() => setNewlyPaid([])} aria-label="Ocultar aviso" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filtros + Bulk */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Filtrar:</span>
          {[
            { value: "all", label: "Todos" },
            { value: "pendiente", label: "Pendiente" },
            { value: "liquidado", label: "Liquidado" },
            { value: "pagado", label: "Pagado" },
          ].map((f) => (
            <button key={f.value} onClick={() => setFilterStatus(f.value)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                filterStatus === f.value ? "bg-primary text-white" : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200")}>
              {f.label}
            </button>
          ))}
        </div>
        {summary.liquidado > 0 && (
          <button onClick={handleBulkPay} disabled={markingPaid === "bulk"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50">
            <DollarSign className="h-3.5 w-3.5" />
            {markingPaid === "bulk" ? "Procesando..." : `Pagar todo liquidado (S/${summary.liquidado.toFixed(2)})`}
          </button>
        )}
      </div>

      {filtered.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin comisiones {filterStatus !== "all" ? `en estado "${filterStatus}"` : "registradas aún"}</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Total orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Comisión</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-[var(--text-primary)]">#{e.orderId.slice(-8).toUpperCase()}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">S/{e.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          <StatusIcon className="h-3 w-3" /> {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)]">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.status === "liquidado" && (
                          <button onClick={() => handleMarkPaid(e.id)} disabled={markingPaid === e.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success)] text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
                            title="Marcar como pagado">
                            <CheckCircle className="h-3 w-3" />
                            {markingPaid === e.id ? "..." : "Pagar"}
                          </button>
                        )}
                        {e.status === "pagado" && <span className="text-xs text-[var(--text-tertiary)]">Pagado</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
