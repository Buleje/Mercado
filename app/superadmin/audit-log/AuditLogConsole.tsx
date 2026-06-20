"use client";

/**
 * AuditLogConsole — registro de acciones del superadmin (Brandon 2026-06-19,
 * idea #F). Impersonaciones y acciones sensibles: quién hizo qué y cuándo, con
 * filtro, búsqueda y export CSV. Datos reales de /api/superadmin/audit-log.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History, LogIn, Clock, Users, RefreshCw, Download, Search,
} from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Row = { action: string; detail: string; user: string; createdAt: string };
type Data = { kpis: { total: number; impersonations: number; last24h: number; users: number }; byAction: { action: string; count: number }[]; log: Row[] };

const dt = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function exportCSV(rows: Row[]) {
  const head = ["Fecha", "Accion", "Operador", "Detalle"];
  const lines = rows.map((r) => [new Date(r.createdAt).toISOString(), r.action, r.user, r.detail]);
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `auditoria-superadmin-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function AuditLogConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/superadmin/audit-log", { credentials: "include", cache: "no-store" });
      if (res.ok) setD((await res.json()) as Data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(true), 30_000);

  const filtered = useMemo(() => {
    if (!d) return [];
    const ql = q.trim().toLowerCase();
    return d.log.filter((r) => (actionFilter === "all" || r.action === actionFilter) && (!ql || `${r.action} ${r.user} ${r.detail}`.toLowerCase().includes(ql)));
  }, [d, actionFilter, q]);

  if (loading && !d) return <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />;
  if (!d) return null;
  const k = d.kpis;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAKpiCard icon={History} label="Acciones" value={k.total.toLocaleString("es-PE")} sub="registradas" />
        <SAKpiCard icon={LogIn} label="Impersonaciones" value={k.impersonations.toLocaleString("es-PE")} sub="entradas a paneles" tone={k.impersonations > 0 ? "warn" : "default"} />
        <SAKpiCard icon={Clock} label="Últimas 24h" value={k.last24h} tone={k.last24h > 0 ? "warn" : "default"} />
        <SAKpiCard icon={Users} label="Operadores" value={k.users} sub="distintos" />
      </div>

      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">Por acción</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActionFilter("all")} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${actionFilter === "all" ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>Todas <span className="tabular-nums opacity-70">{k.total}</span></button>
          {d.byAction.map((a) => (
            <button key={a.action} type="button" onClick={() => setActionFilter(a.action)} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${actionFilter === a.action ? "bg-[var(--accent)] text-white" : "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"}`}><span className="font-mono">{a.action}</span> <span className="tabular-nums opacity-70">{a.count}</span></button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 flex-wrap">
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Registro de acciones (últimas {d.log.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio, operador…" aria-label="Buscar" className="h-9 w-52 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            </div>
            <button type="button" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
            <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center rounded-lg border border-[var(--rule-base)] px-2 text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </header>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-canvas)] text-left">
              <tr className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-4 py-2 whitespace-nowrap">Fecha</th><th className="px-2 py-2">Acción</th><th className="px-2 py-2">Operador</th><th className="px-2 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-[var(--surface-sunken)]/40">
                  <td className="px-4 py-2 tabular-nums text-[var(--text-tertiary)] whitespace-nowrap">{dt(r.createdAt)}</td>
                  <td className="px-2 py-2"><span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{r.action}</span></td>
                  <td className="px-2 py-2 font-bold text-[var(--text-primary)] whitespace-nowrap">{r.user}</td>
                  <td className="px-2 py-2 text-[var(--text-secondary)]">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
