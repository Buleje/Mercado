"use client";

/**
 * /superadmin/tenants/integrations — Estado de integraciones por tienda
 * (Brandon 2026-06-14). Matriz WhatsApp · Yape · Plin · SUNAT.
 *
 * v2 (Brandon 2026-06-19): KPIs de cobertura (incl. sin cobros / sin
 * facturación = riesgo de negocio), barras de adopción por integración,
 * búsqueda + filtros + orden, badges de riesgo, ayuda contextual, CSV,
 * auto-refresh. Datos reales del endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Zap, ArrowLeft, RefreshCw, Check, X, MessageSquare, Search, Download, AlertTriangle,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

type Key = "whatsapp" | "yape" | "plin" | "sunat";
type Integ = Record<Key, boolean>;
type Row = { slug: string; name: string; integrations: Integ; active: number; missing: number };
type Summary = { total: number } & Record<Key, number>;
type FilterKey = "all" | "incomplete" | "nocobros" | `no:${Key}`;
type SortKey = "missing" | "name";

const COLS: { key: Key; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "yape", label: "Yape" },
  { key: "plin", label: "Plin" },
  { key: "sunat", label: "SUNAT" },
];

const noCobros = (r: Row) => !r.integrations.yape && !r.integrations.plin;
const noFactura = (r: Row) => !r.integrations.sunat;

function missingLabels(r: Row): string {
  return COLS.filter((c) => !r.integrations[c.key]).map((c) => c.label).join(", ");
}
function helpMsg(r: Row): string {
  return `Hola, vi que ${r.name} todavía no configuró: ${missingLabels(r)}. ¿Te ayudo a activarlas para que cobres y factures sin fricción?`;
}

function exportCSV(rows: Row[]) {
  const head = ["Tienda", "Slug", "WhatsApp", "Yape", "Plin", "SUNAT", "Activas", "Faltan"];
  const lines = rows.map((r) => [r.name, r.slug, r.integrations.whatsapp ? "sí" : "no", r.integrations.yape ? "sí" : "no", r.integrations.plin ? "sí" : "no", r.integrations.sunat ? "sí" : "no", r.active, r.missing]);
  const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `integraciones-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]"><Check className="h-4 w-4" strokeWidth={3} /></span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]"><X className="h-4 w-4" strokeWidth={3} /></span>
  );
}

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "bad" }) {
  const c = tone === "good" ? "text-[var(--data-success-600,#059669)]" : tone === "bad" ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-primary)]";
  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function IntegrationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("missing");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/integrations");
      if (res.ok) {
        const d = (await res.json()) as { rows: Row[]; summary: Summary };
        setRows(d.rows ?? []); setSummary(d.summary ?? null);
        setLastAt(new Date().toISOString());
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => { if (!(typeof document !== "undefined" && document.hidden)) void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const kpis = useMemo(() => {
    const cells = rows.length * COLS.length;
    const on = rows.reduce((s, r) => s + r.active, 0);
    return {
      adoption: cells ? Math.round((on / cells) * 100) : 0,
      complete: rows.filter((r) => r.missing === 0).length,
      noCobros: rows.filter(noCobros).length,
      noFactura: rows.filter(noFactura).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "incomplete" && r.missing === 0) return false;
      if (filter === "nocobros" && !noCobros(r)) return false;
      if (filter.startsWith("no:") && r.integrations[filter.slice(3) as Key]) return false;
      if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (b.missing - a.missing || a.name.localeCompare(b.name)));
  }, [filtered, sort]);

  const hasFilters = search !== "" || filter !== "all";

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
      <AdminTabShell
        info={{
          what: "Matriz de integraciones por tienda: muestra si cada una tiene activo WhatsApp (notificaciones), Yape y Plin (cobro) y SUNAT (facturación electrónica). Incluye KPIs de adopción y alertas de riesgo.",
          affects: "Solo lectura para el superadmin. Las tiendas marcadas como 'sin cobros' (sin Yape ni Plin) no pueden recibir pagos digitales — es una alerta de negocio crítica.",
          example: "Si ves 3 tiendas con badge 'no cobra', puedes hacer clic en 'Ayudar' para enviarles un mensaje directo con el paso a paso para activar Yape.",
        }}
        title="Integraciones"
        kicker="Plataforma · Tiendas"
        description="Qué tiene configurado cada tienda: WhatsApp, Yape, Plin y facturación SUNAT."
        icon={Zap}
        actions={
          <div className="flex items-center gap-2">
            {lastAt && <span className="hidden sm:inline text-xs text-[var(--text-tertiary)] tabular-nums">Actualizado {new Date(lastAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })} · auto 60s</span>}
            <button onClick={() => exportCSV(sorted)} disabled={sorted.length === 0} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
            <Link href="/superadmin/tenants" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40">
              <ArrowLeft className="h-4 w-4" /> Tiendas
            </Link>
          </div>
        }
      >
        {/* KPIs de cobertura */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Adopción global" value={`${kpis.adoption}%`} sub="de las 4 integraciones" tone={kpis.adoption >= 60 ? "good" : "default"} />
          <Kpi label="Completas" value={String(kpis.complete)} sub="con las 4 activas" tone="good" />
          <button type="button" onClick={() => setFilter("nocobros")} className="text-left">
            <Kpi label="Sin cobros" value={String(kpis.noCobros)} sub="sin Yape ni Plin → no cobran" tone={kpis.noCobros > 0 ? "bad" : "good"} />
          </button>
          <button type="button" onClick={() => setFilter("no:sunat")} className="text-left">
            <Kpi label="Sin facturación" value={String(kpis.noFactura)} sub="sin SUNAT" tone={kpis.noFactura > 0 ? "bad" : "default"} />
          </button>
        </div>

        {/* Adopción por integración (barras) */}
        {summary && (
          <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Adopción por integración</h3>
            <div className="space-y-2.5">
              {COLS.map((c) => {
                const n = summary[c.key]; const pct = summary.total ? Math.round((n / summary.total) * 100) : 0;
                return (
                  <button key={c.key} type="button" onClick={() => setFilter(`no:${c.key}`)} title={`Ver tiendas sin ${c.label}`} className="flex w-full items-center gap-3 text-left">
                    <span className="w-20 shrink-0 text-sm font-semibold text-[var(--text-primary)]">{c.label}</span>
                    <div className="flex-1 h-3 rounded bg-[var(--surface-sunken)] overflow-hidden">
                      <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{pct}%</span>
                    <span className="w-12 shrink-0 text-right text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{n}/{summary.total}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tienda o slug…" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-9 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpiar" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>}
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} aria-label="Filtrar" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer">
            <option value="all">Todas</option>
            <option value="incomplete">Incompletas</option>
            <option value="nocobros">Sin cobros (Yape+Plin)</option>
            {COLS.map((c) => <option key={c.key} value={`no:${c.key}`}>Sin {c.label}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer">
            <option value="missing">Orden: faltan</option>
            <option value="name">Orden: nombre</option>
          </select>
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">{[0,1,2,3,4].map((i) => <div key={i} className="h-12 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--rule-base)] py-12 text-center">
            <p className="text-sm font-bold text-[var(--text-primary)]">Ninguna tienda con estos filtros</p>
            {hasFilters && <button type="button" onClick={() => { setSearch(""); setFilter("all"); }} className="mt-2 text-sm font-bold text-[var(--accent)] hover:underline">Limpiar filtros</button>}
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-tertiary)] mb-2 tabular-nums">{sorted.length} de {rows.length} tiendas</p>
            <div className="overflow-x-auto border border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-3 py-2.5"><button type="button" onClick={() => setSort(sort === "name" ? "missing" : "name")} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]">Tienda <span className="text-[10px]" aria-hidden>{sort === "name" ? "▲" : "⇅"}</span></button></th>
                    {COLS.map((c) => <th key={c.key} className="px-3 py-2.5 text-center">{c.label}</th>)}
                    <th className="px-3 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-base)]">
                  {sorted.map((r) => {
                    const nc = noCobros(r);
                    return (
                      <tr key={r.slug} className={nc ? "bg-[var(--data-error-500)]/8" : r.missing >= 3 ? "bg-[var(--data-error-500)]/5" : ""}>
                        <td className="px-3 py-2.5 font-bold text-[var(--text-primary)] truncate max-w-[220px]">
                          <span className="flex items-center gap-1.5">
                            {r.name}
                            {nc && <span className="rounded-full bg-[var(--data-error-500)] px-1.5 py-0.5 text-[10px] font-extrabold text-white shrink-0">no cobra</span>}
                          </span>
                        </td>
                        {COLS.map((c) => <td key={c.key} className="px-3 py-2.5 text-center"><div className="flex justify-center"><Cell on={r.integrations[c.key]} /></div></td>)}
                        <td className="px-3 py-2.5 text-right">
                          {r.missing > 0 ? (
                            <Link href={`/superadmin/chat?tenant=${r.slug}&msg=${encodeURIComponent(helpMsg(r))}`} title={helpMsg(r)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline">
                              <MessageSquare className="h-3.5 w-3.5" /> Ayudar
                            </Link>
                          ) : <span className="inline-flex items-center gap-1 text-xs text-[var(--data-success-600,#059669)] font-bold"><Check className="h-3.5 w-3.5" /> Completo</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Banner riesgo: tiendas que no cobran */}
        {kpis.noCobros > 0 && filter === "all" && (
          <div className="mt-4 flex items-center gap-3 border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/5 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0" />
            <p className="text-sm font-bold text-[var(--data-error-600,#dc2626)]">{kpis.noCobros} {kpis.noCobros === 1 ? "tienda no puede cobrar" : "tiendas no pueden cobrar"} (sin Yape ni Plin)</p>
            <button type="button" onClick={() => setFilter("nocobros")} className="ml-auto text-sm font-bold text-[var(--accent)] hover:underline shrink-0">Ver cuáles</button>
          </div>
        )}
      </AdminTabShell>
    </>
  );
}
