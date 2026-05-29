"use client";

/**
 * CacaoProductores — analítica de proveedores de cacao (ADR-128 v2).
 * Self-fetch de productores CON agregados de compra (kg, pagado, lotes, última,
 * calidad). KPIs + búsqueda + orden + filtro activo + export CSV + ficha drawer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Plus, Search, RefreshCw, Coins, Scale, Award, Download, AlertCircle, PackageCheck, Trophy,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import CacaoProducerForm from "./CacaoProducerForm";
import CacaoProducerDrawer from "./CacaoProducerDrawer";
import CacaoLoteDrawer from "./CacaoLoteDrawer";

interface PStats { kg: number; pagado: number; lotes: number; lastFecha: string | null; gradoI: number }
interface Producer {
  id: string; codigo: string | null; nombre: string; dni: string | null; sector: string | null;
  parcelaHa: string | null; variedad: string | null; certificacion: string | null; status: string; stats: PStats;
}
interface Summary { total: number; conCompras: number; totalKg: number; totalPagado: number; top: { nombre: string; kg: number; pagado: number } | null }

const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fdate = (iso: string | null) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
const CERT_LABEL: Record<string, string> = { organico: "Orgánico", comercio_justo: "Comercio justo", convencional: "Convencional" };
type Sort = "pagado" | "kg" | "lotes" | "reciente" | "nombre";
const SORTS: { v: Sort; label: string }[] = [
  { v: "pagado", label: "Más pagado" }, { v: "kg", label: "Más kg" }, { v: "lotes", label: "Más lotes" },
  { v: "reciente", label: "Compra reciente" }, { v: "nombre", label: "Nombre A-Z" },
];

export default function CacaoProductores() {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("pagado");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/cacao?view=producers-stats${includeInactive ? "&all=1" : ""}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProducers(d.producers ?? []); setSummary(d.summary ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [includeInactive]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? producers.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q) || (p.sector ?? "").toLowerCase().includes(q)) : [...producers];
    list.sort((a, b) => {
      if (sort === "nombre") return a.nombre.localeCompare(b.nombre);
      if (sort === "reciente") return (b.stats.lastFecha ?? "").localeCompare(a.stats.lastFecha ?? "");
      return b.stats[sort] - a.stats[sort];
    });
    return list;
  }, [producers, search, sort]);

  function exportCsv() {
    const head = ["Codigo", "Nombre", "DNI", "Sector", "Variedad", "Certificacion", "Estado", "Kg comprados", "Pagado", "Lotes", "Lotes Grado I", "Ultima compra"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = view.map((p) => [p.codigo, p.nombre, p.dni, p.sector, p.variedad, p.certificacion, p.status, n2(p.stats.kg), n2(p.stats.pagado), p.stats.lotes, p.stats.gradoI, p.stats.lastFecha ? p.stats.lastFecha.slice(0, 10) : ""].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `cacao-productores-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Productores" value={String(summary?.total ?? 0)} subValue={`${summary?.conCompras ?? 0} con compras`} icon={Users} emphasis="neutral" />
        <StatCard label="Kg comprado (total)" value={`${n2(summary?.totalKg ?? 0)} kg`} icon={Scale} emphasis="success" />
        <StatCard label="Pagado (total)" value={`S/ ${n2(summary?.totalPagado ?? 0)}`} icon={Coins} emphasis="neutral" />
        <StatCard label="Productor top" value={summary?.top ? `S/ ${n2(summary.top.pagado)}` : "—"} subValue={summary?.top?.nombre ?? "sin compras"} icon={Trophy} emphasis={summary?.top ? "success" : "neutral"} />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o sector…" className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setIncludeInactive((v) => !v)} className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold ${includeInactive ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"} hover:bg-[var(--surface-canvas)]`}>{includeInactive ? "Todos" : "Activos"}</button>
        <button type="button" onClick={exportCsv} disabled={view.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo productor</button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Productor</Th><Th>Sector</Th><Th className="text-right">Kg comprados</Th><Th className="text-right">Pagado</Th>
              <Th className="text-right">Lotes</Th><Th className="text-right">Calidad I</Th><Th className="text-right">Última</Th>
            </tr>
          </thead>
          <tbody>
            {view.map((p) => (
              <tr key={p.id} onClick={() => setDrawerId(p.id)} className={`cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)] ${p.status === "inactivo" ? "opacity-50" : ""}`}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{p.nombre}</span>
                    {p.certificacion && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]"><Award className="h-3 w-3" />{CERT_LABEL[p.certificacion] ?? p.certificacion}</span>}
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)]"><span className="font-mono">{p.codigo ?? "—"}</span>{p.variedad ? ` · ${p.variedad}` : ""}{p.status === "inactivo" ? " · inactivo" : ""}</span>
                </Td>
                <Td className="text-[var(--text-secondary)]">{p.sector ?? "—"}</Td>
                <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{p.stats.lotes ? `${n2(p.stats.kg)}` : "—"}</Td>
                <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{p.stats.lotes ? `S/ ${n2(p.stats.pagado)}` : "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.stats.lotes || "—"}</Td>
                <Td className="text-right">{p.stats.lotes ? <span className="font-mono text-xs font-bold tabular-nums text-[var(--data-success-700)]">{p.stats.gradoI}/{p.stats.lotes}</span> : <span className="text-xs text-[var(--text-tertiary)]">—</span>}</Td>
                <Td className="text-right text-xs text-[var(--text-tertiary)]">{fdate(p.stats.lastFecha)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && producers.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
        ) : view.length === 0 && (
          search ? <div className="p-12 text-center text-[var(--text-tertiary)]"><Search className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-base font-medium">Sin resultados para tu búsqueda.</p></div>
          : <div className="p-12 text-center text-[var(--text-tertiary)]">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><Users className="h-7 w-7" /></span>
              <p className="text-base font-bold text-[var(--text-primary)]">Aún no tenés productores</p>
              <p className="mx-auto mt-1 max-w-sm text-sm">Registrá a tus proveedores para vincularlos a los lotes y ver su historial de compras y calidad.</p>
              <button type="button" onClick={() => setShowNew(true)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Agregar productor</button>
            </div>
        )}
      </div>

      {showNew && <CacaoProducerForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {drawerId && <CacaoProducerDrawer producerId={drawerId} onClose={() => setDrawerId(null)} onChanged={load} onOpenLote={(id) => { setDrawerId(null); setLoteDrawerId(id); }} />}
      {loteDrawerId && <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
