"use client";

/**
 * ComplianceAuditConsole — registro de auditoría Ley 29733 (Brandon 2026-06-19).
 * Accesos a datos personales (ActivityLog [L29733]): KPIs, desglose por tipo de
 * dato y acción, y el log filtrable + export CSV (evidencia de cumplimiento).
 * Datos reales de /api/superadmin/compliance-audit.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Users, Clock, Database, RefreshCw, Download, Search,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type LogRow = { action: string; dataType: string; detail: string; user: string; tenantName: string; ipAddress: string | null; createdAt: string };
type Data = {
  kpis: { totalAccesses: number; tenants: number; last7d: number; dataTypes: number };
  byType: { type: string; count: number }[];
  byAction: { action: string; count: number }[];
  log: LogRow[];
};

const dt = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function exportCSV(rows: LogRow[]) {
  const head = ["Fecha", "Accion", "Dato personal", "Usuario", "Negocio", "IP", "Detalle"];
  const lines = rows.map((r) => [new Date(r.createdAt).toISOString(), r.action, r.dataType, r.user, r.tenantName, r.ipAddress ?? "", r.detail]);
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `auditoria-l29733-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function ComplianceAuditConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/compliance-audit", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 60_000);

  const filtered = useMemo(() => {
    if (!d) return [];
    const ql = q.trim().toLowerCase();
    return d.log.filter((r) => (typeFilter === "all" || r.dataType === typeFilter) && (!ql || `${r.user} ${r.tenantName} ${r.dataType} ${r.action} ${r.detail}`.toLowerCase().includes(ql)));
  }, [d, typeFilter, q]);

  if (loading && !d) return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const k = d.kpis;
  const maxType = Math.max(1, ...d.byType.map((t) => t.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAKpiCard icon={ShieldCheck} label="Accesos a datos" value={k.totalAccesses.toLocaleString("es-PE")} sub="personales (histórico)" />
        <SAKpiCard icon={Users} label="Negocios" value={k.tenants} sub="con tratamiento de datos" />
        <SAKpiCard icon={Clock} label="Últimos 7 días" value={k.last7d} tone={k.last7d > 0 ? "warn" : "default"} />
        <SAKpiCard icon={Database} label="Tipos de dato" value={k.dataTypes} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Por tipo de dato personal</p>
          <div className="space-y-1.5">
            {d.byType.map((t) => (
              <div key={t.type} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm font-bold text-[var(--text-primary)] truncate">{t.type}</span>
                <div className="flex-1 h-2.5 rounded bg-[var(--surface-sunken)] overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round((t.count / maxType) * 100)}%` }} /></div>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--text-tertiary)]">{t.count}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Por acción</p>
          <div className="flex flex-wrap gap-2">
            {d.byAction.map((a) => (
              <span key={a.action} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">{a.action} <span className="tabular-nums text-[var(--text-tertiary)]">{a.count}</span></span>
            ))}
          </div>
          <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">CONSENT_GRANTED = consentimiento del titular registrado. UPDATE/CREATE = tratamiento del dato.</p>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 flex-wrap">
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Registro de accesos (últimos {d.log.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar en el registro" className="h-9 w-44 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filtrar por tipo" className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)]">
              <option value="all">Todos los tipos</option>
              {d.byType.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
            </select>
            <button type="button" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
            <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center rounded-lg border border-[var(--rule-base)] px-2 text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </header>
        <div className="max-h-[460px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-canvas)] text-left">
              <tr className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-4 py-2">Fecha</th><th className="px-2 py-2">Acción</th><th className="px-2 py-2">Dato</th><th className="px-2 py-2">Usuario</th><th className="px-2 py-2">Negocio</th><th className="px-2 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-[var(--surface-sunken)]/40">
                  <td className="px-4 py-2 tabular-nums text-[var(--text-tertiary)] whitespace-nowrap">{dt(r.createdAt)}</td>
                  <td className="px-2 py-2"><span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{r.action}</span></td>
                  <td className="px-2 py-2 font-bold text-[var(--text-primary)]">{r.dataType}</td>
                  <td className="px-2 py-2 text-[var(--text-secondary)] truncate max-w-[120px]">{r.user}</td>
                  <td className="px-2 py-2 text-[var(--text-secondary)] truncate max-w-[140px]">{r.tenantName}</td>
                  <td className="px-2 py-2 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{r.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
