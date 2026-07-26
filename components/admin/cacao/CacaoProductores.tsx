"use client";

/**
 * CacaoProductores — analítica de proveedores de cacao (ADR-128 v2).
 * Self-fetch de productores CON agregados de compra (kg, pagado, lotes, última,
 * calidad). KPIs + búsqueda + orden + filtro activo + export CSV + ficha drawer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Plus, Search, RefreshCw, Coins, Scale, Award, Download, AlertCircle, Trophy, AlertTriangle, Link2,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import CacaoProducerForm from "./CacaoProducerForm";
import CacaoProducerDrawer from "./CacaoProducerDrawer";
import CacaoLoteDrawer from "./CacaoLoteDrawer";
import CacaoReconcileModal from "./CacaoReconcileModal";

interface PStats { kg: number; pagado: number; abonado: number; saldo: number; lotes: number; lastFecha: string | null; gradoI: number }
interface Producer {
  id: string; codigo: string | null; nombre: string; dni: string | null; sector: string | null;
  parcelaHa: string | null; variedad: string | null; certificacion: string | null; status: string; stats: PStats;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("pagado");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  const [showReconcile, setShowReconcile] = useState(false);
  const [orphan, setOrphan] = useState<{ lotes: number; pagado: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r, ro] = await Promise.all([
        fetch(`/api/admin/cacao?view=producers-stats${includeInactive ? "&all=1" : ""}`, { credentials: "include" }),
        fetch("/api/admin/cacao?view=orphan-lotes", { credentials: "include" }),
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProducers(d.producers ?? []);
      // Lotes de acopio con nombre libre pero sin FK al padrón: no suman al
      // historial del productor. Se ofrecen para reconciliar (banner + modal).
      if (ro.ok) { const od = await ro.json(); setOrphan({ lotes: od.totals?.lotes ?? 0, pagado: od.totals?.pagado ?? 0 }); }
      else setOrphan(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [includeInactive]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? producers.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q) || (p.sector ?? "").toLowerCase().includes(q)) : [...producers];
    list.sort((a, b) => {
      if (sort === "nombre") return a.nombre.localeCompare(b.nombre);
      if (sort === "reciente") return (b.stats.lastFecha ?? "").localeCompare(a.stats.lastFecha ?? "");
      return b.stats[sort] - a.stats[sort];
    });
    return list;
  }, [producers, search, sort]);

  // KPIs derivados de lo que se ve (respeta búsqueda/filtro), no del total global
  // del server — así el header no contradice la lista filtrada.
  const kpis = useMemo(() => {
    const conCompras = view.filter((p) => p.stats.lotes > 0);
    const totalKg = conCompras.reduce((a, p) => a + p.stats.kg, 0);
    const totalPagado = conCompras.reduce((a, p) => a + p.stats.pagado, 0);
    const totalSaldo = conCompras.reduce((a, p) => a + p.stats.saldo, 0);
    const top = conCompras.reduce<{ nombre: string; pagado: number } | null>(
      (best, p) =>
        !best || p.stats.pagado > best.pagado ? { nombre: p.nombre, pagado: p.stats.pagado } : best,
      null,
    );
    return { total: view.length, conCompras: conCompras.length, totalKg, totalPagado, totalSaldo, top };
  }, [view]);

  function exportCsv() {
    const head = ["Codigo", "Nombre", "DNI", "Sector", "Variedad", "Certificacion", "Estado", "Kg comprados", "A pagar", "Abonado", "Saldo", "Lotes", "Lotes Grado I", "Ultima compra"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = view.map((p) => [p.codigo, p.nombre, p.dni, p.sector, p.variedad, p.certificacion, p.status, n2(p.stats.kg), n2(p.stats.pagado), n2(p.stats.abonado), n2(p.stats.saldo), p.stats.lotes, p.stats.gradoI, p.stats.lastFecha ? p.stats.lastFecha.slice(0, 10) : ""].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `cacao-productores-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Productores" value={String(kpis.total)} subValue={`${kpis.conCompras} con compras`} icon={Users} emphasis="neutral" />
        <StatCard label="Kg comprado" value={`${n2(kpis.totalKg)} kg`} icon={Scale} emphasis="success" />
        <StatCard label="A pagar" value={`S/ ${n2(kpis.totalPagado)}`} subValue={kpis.totalSaldo > 0 ? `debés S/ ${n2(kpis.totalSaldo)}` : "al día"} icon={Coins} emphasis={kpis.totalSaldo > 0 ? "warning" : "success"} />
        <StatCard label="Productor top" value={kpis.top ? `S/ ${n2(kpis.top.pagado)}` : "—"} subValue={kpis.top?.nombre ?? "sin compras"} icon={Trophy} emphasis={kpis.top ? "success" : "neutral"} />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* Lotes de acopio sin vínculo al padrón: no suman al historial ni a los
          pagos del productor. Se ofrece reconciliar en 1 click. */}
      {orphan && orphan.lotes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="min-w-[180px] flex-1">
            <strong>{orphan.lotes} lote{orphan.lotes === 1 ? "" : "s"}</strong> (S/ {n2(orphan.pagado)}) de acopio sin vincular al padrón. No suman al historial ni a los pagos del productor.
          </div>
          <button type="button" onClick={() => setShowReconcile(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-warning-500)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90">
            <Link2 className="h-4 w-4" />Vincular ahora
          </button>
        </div>
      )}

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
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo productor</button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Productor</Th><Th>Sector</Th><Th className="text-right">Kg comprados</Th><Th className="text-right">A pagar</Th>
              <Th className="text-right">Lotes</Th><Th className="text-right">Calidad I</Th><Th className="text-right">Última</Th>
            </tr>
          </thead>
          <tbody>
            {view.map((p) => (
              <tr key={p.id} role="button" tabIndex={0} aria-label={`Ver ficha de ${p.nombre}`} onClick={() => setDrawerId(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrawerId(p.id); } }} className={`cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:bg-[var(--surface-sunken)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${p.status === "inactivo" ? "opacity-50" : ""}`}>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{p.nombre}</span>
                    {p.certificacion && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]"><Award className="h-3 w-3" />{CERT_LABEL[p.certificacion] ?? p.certificacion}</span>}
                    {p.stats.saldo > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"><AlertTriangle className="h-3 w-3" />Debés S/ {n2(p.stats.saldo)}</span>}
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
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Users className="h-7 w-7" /></span>
              <p className="text-base font-bold text-[var(--text-primary)]">Aún no tienes productores</p>
              <p className="mx-auto mt-1 max-w-sm text-sm">Registrá a tus proveedores para vincularlos a los lotes y ver su historial de compras y calidad.</p>
              <button type="button" onClick={() => setShowNew(true)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Agregar productor</button>
            </div>
        )}
      </div>

      {showReconcile && <CacaoReconcileModal onClose={() => setShowReconcile(false)} onDone={load} />}
      {showNew && <CacaoProducerForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {drawerId && <CacaoProducerDrawer producerId={drawerId} onClose={() => setDrawerId(null)} onChanged={load} onOpenLote={(id) => { setDrawerId(null); setLoteDrawerId(id); }} />}
      {loteDrawerId && <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
