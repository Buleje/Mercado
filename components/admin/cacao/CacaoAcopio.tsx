"use client";

/**
 * CacaoAcopio — Módulo admin de Acopio & Beneficio de Cacao (ADR-128).
 * Gating: spec:agricola:cacao-acopio. Sub-vistas: Acopio · Productores · Resumen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Leaf, Plus, RefreshCw, Search, Users, Scale, Coins, PackageCheck, AlertCircle, X as XIcon, BarChart3, Droplets,
  Warehouse, TrendingUp, Download, Filter, Award, Newspaper, Sparkles, AlertTriangle,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { GRADO_LABEL, CACAO_VARIEDADES, type CacaoGrado } from "@/lib/cacao/cacao-quality";
import CacaoLoteForm from "./CacaoLoteForm";
import CacaoProducerForm from "./CacaoProducerForm";
import CacaoBeneficioForm from "./CacaoBeneficioForm";
import CacaoLoteDrawer from "./CacaoLoteDrawer";
import CacaoProducerDrawer from "./CacaoProducerDrawer";
import CacaoNoticiero from "./CacaoNoticiero";
import CacaoAsesor from "./CacaoAsesor";
import { printCacaoReporte } from "@/lib/cacao/cacao-reporte";

type View = "acopio" | "beneficio" | "inventario" | "productores" | "resumen" | "mercado" | "asesor";
interface Beneficio {
  id: string; loteCode: string | null; estado: string; fermDias: number | null; secDias: number | null;
  metodoSecado: string | null; humedadFinal: string | null; pesoHumedoKg: string | null; pesoSecoKg: string | null; mermaPct: string | null;
}
interface Lote {
  id: string; loteCode: string; fecha: string; productorNombre: string | null; variedad: string | null;
  tipoGrano: string; pesoKg: string; humedadPct: string | null; precioPorKg: string | null; totalPagado: string | null;
  indiceFermentacion: string | null; grado: string | null; status: string; annulledReason: string | null;
}
interface Producer { id: string; codigo: string | null; nombre: string; dni: string | null; sector: string | null; parcelaHa: string | null; variedad: string | null; certificacion: string | null }
interface Stats {
  lotes: number; productoresActivos: number; kgAcopiados: number; valorPagado: number; indiceFermentacionProm: number; pctHumedadEnNorma: number;
  porVariedad: { variedad: string; kg: number }[]; porGrado: { grado: string; count: number }[];
}
interface Inventory {
  kgSecoDisponible: number; kgSecoBeneficio: number; kgSecoAcopiado: number; kgHumedoProceso: number; kgSecoProyectado: number;
  precioRefProm: number; valorEstimado: number; rendimientoProm: number | null; lotesEnProceso: number;
}
interface Trends {
  meses: { mes: string; kg: number; valor: number }[];
  topProductores: { nombre: string; kg: number; pagado: number; lotes: number }[];
  calidad: { bien: number; violeta: number; pizarroso: number; mohoso: number; muestras: number } | null;
  humedadFuera: { loteCode: string; humedadPct: number }[]; humedadFueraCount: number;
}

const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const n2 = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(2));
const VIEWS: { key: View; label: string; icon: typeof Leaf; hint: string }[] = [
  { key: "acopio", label: "Acopio", icon: PackageCheck, hint: "Lotes recibidos" },
  { key: "beneficio", label: "Beneficio", icon: Droplets, hint: "Fermentación + secado" },
  { key: "inventario", label: "Inventario", icon: Warehouse, hint: "Cacao seco" },
  { key: "productores", label: "Productores", icon: Users, hint: "Proveedores" },
  { key: "resumen", label: "Resumen", icon: BarChart3, hint: "KPIs de campaña" },
  { key: "mercado", label: "Mercado", icon: Newspaper, hint: "Precios y noticias" },
  { key: "asesor", label: "Asesor", icon: Sparkles, hint: "¿Vender o aguantar?" },
];
const ESTADO_BENEFICIO: Record<string, { label: string; cls: string }> = {
  fermentando: { label: "Fermentando", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" },
  secando: { label: "Secando", cls: "bg-[var(--data-info-100)] text-[var(--data-info-900)]" },
  terminado: { label: "Terminado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-900)]" },
};

export default function CacaoAcopio() {
  const [view, setView] = useState<View>("acopio");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLote, setShowLote] = useState(false);
  const [showProducer, setShowProducer] = useState(false);
  const [showBeneficio, setShowBeneficio] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [annulReason, setAnnulReason] = useState("");
  const [loteDrawerId, setLoteDrawerId] = useState<string | null>(null);
  const [producerDrawerId, setProducerDrawerId] = useState<string | null>(null);
  // Filtros de acopio (task #4)
  const [fVariedad, setFVariedad] = useState("");
  const [fGrado, setFGrado] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async (v: View, fOverride?: { variedad?: string; grado?: string; from?: string; to?: string }) => {
    if (v === "mercado" || v === "asesor") { setLoading(false); return; } // se auto-cargan
    setLoading(true); setError(null);
    const fv = fOverride?.variedad ?? fVariedad, fg = fOverride?.grado ?? fGrado, ff = fOverride?.from ?? fFrom, ft = fOverride?.to ?? fTo;
    try {
      if (v === "resumen") {
        const [rs, rt] = await Promise.all([
          fetch(`/api/admin/cacao?view=stats`, { credentials: "include" }),
          fetch(`/api/admin/cacao?view=trends`, { credentials: "include" }),
        ]);
        if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
        setStats((await rs.json()).stats ?? null);
        setTrends(rt.ok ? (await rt.json()).trends ?? null : null);
        return;
      }
      const param = v === "productores" ? "producers" : v === "inventario" ? "inventory" : v === "beneficio" ? "beneficios" : "lotes";
      const q = new URLSearchParams({ view: param });
      if (search.trim() && v !== "inventario") q.set("search", search.trim());
      if (v === "acopio") {
        if (fv) q.set("variedad", fv);
        if (fg) q.set("grado", fg);
        if (ff) q.set("from", new Date(ff).toISOString());
        if (ft) q.set("to", new Date(ft + "T23:59:59").toISOString());
      }
      const r = await fetch(`/api/admin/cacao?${q}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const d = await r.json();
      if (v === "productores") setProducers(d.producers ?? []);
      else if (v === "inventario") setInventory(d.inventory ?? null);
      else if (v === "beneficio") setBeneficios(d.beneficios ?? []);
      else setLotes(d.lotes ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [search, fVariedad, fGrado, fFrom, fTo]);
  useEffect(() => { load(view); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  async function annul() {
    if (!annulId || annulReason.trim().length < 3) return;
    try {
      const r = await fetch("/api/admin/cacao", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "annul_lote", id: annulId, reason: annulReason.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setAnnulId(null); setAnnulReason(""); load("acopio");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const kpis = useMemo(() => {
    const reg = lotes.filter((l) => l.status === "registrado");
    const kg = reg.reduce((a, l) => a + Number(l.pesoKg ?? 0), 0);
    const valor = reg.reduce((a, l) => a + Number(l.totalPagado ?? 0), 0);
    const gradoI = reg.filter((l) => l.grado === "I").length;
    return { count: reg.length, kg, valor, gradoI };
  }, [lotes]);

  function exportCsv() {
    const head = ["Lote", "Fecha", "Productor", "Variedad", "Tipo", "Peso (kg)", "Humedad %", "Indice ferm %", "Grado", "Precio/kg", "Total pagado", "Estado"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = lotes.map((l) => [
      l.loteCode, new Date(l.fecha).toISOString().slice(0, 10), l.productorNombre ?? "", l.variedad ?? "", l.tipoGrano,
      n2(l.pesoKg), l.humedadPct ?? "", l.indiceFermentacion ?? "", l.grado ?? "", l.precioPorKg ?? "", l.totalPagado ?? "", l.status,
    ].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `cacao-acopio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const activeFilters = [fVariedad, fGrado, fFrom, fTo].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <AdminModuleHeader eyebrow="Agrícola · Especialización" title="Acopio & Beneficio de Cacao" description="Libro de acopio de cacao en grano: productores, lotes, calidad (prueba de corte + humedad NTP-ISO) y liquidación al productor. Alineado a NTP 208.040." icon={Leaf}>
        <button type="button" onClick={() => load(view)} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60" aria-label="Recargar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span>Recargar</span></button>
        {view === "productores"
          ? <button type="button" onClick={() => setShowProducer(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo productor</button>
          : view === "acopio"
          ? <button type="button" onClick={() => setShowLote(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo lote</button>
          : view === "beneficio"
          ? <button type="button" onClick={() => setShowBeneficio(true)} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent-600,var(--accent))] px-5 text-base font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-5 w-5" />Nuevo beneficio</button>
          : null}
      </AdminModuleHeader>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b-2 border-[var(--rule-soft)] pb-px">
        {VIEWS.map((v) => {
          const Icon = v.icon; const active = view === v.key;
          return (
            <button key={v.key} type="button" onClick={() => setView(v.key)} className={`inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-bold transition ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
              <Icon className="h-4 w-4" /><span>{v.label}</span><span className="hidden text-xs font-normal text-[var(--text-tertiary)] sm:inline">· {v.hint}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {/* ACOPIO */}
      {view === "acopio" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Lotes acopiados" value={String(kpis.count)} icon={PackageCheck} emphasis="neutral" />
            <StatCard label="Kg acopiados" value={`${n2(kpis.kg)} kg`} icon={Scale} emphasis="success" />
            <StatCard label="Pagado a productores" value={`S/ ${n2(kpis.valor)}`} icon={Coins} emphasis="neutral" />
            <StatCard label="Lotes Grado I" value={String(kpis.gradoI)} subValue="mejor calidad" icon={Leaf} emphasis={kpis.gradoI > 0 ? "success" : "neutral"} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[200px] flex-1"><SearchBar value={search} onChange={setSearch} onEnter={() => load("acopio")} placeholder="Buscar por lote, productor o variedad…" /></div>
            <button type="button" onClick={() => setShowFilters((s) => !s)} className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold ${showFilters || activeFilters ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"} hover:bg-[var(--surface-canvas)]`}><Filter className="h-4 w-4" />Filtros{activeFilters > 0 && <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[length:var(--ts-2xs)] font-bold text-white">{activeFilters}</span>}</button>
            <button type="button" onClick={exportCsv} disabled={lotes.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]/40 p-4 sm:grid-cols-4">
              <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Variedad</span><select value={fVariedad} onChange={(e) => setFVariedad(e.target.value)} className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"><option value="">Todas</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Grado</span><select value={fGrado} onChange={(e) => setFGrado(e.target.value)} className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]"><option value="">Todos</option><option value="I">Grado I</option><option value="II">Grado II</option><option value="fuera_norma">Fuera de norma</option></select></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Desde</span><input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]" /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Hasta</span><input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm outline-none focus:border-[var(--accent)]" /></label>
              <div className="col-span-2 flex gap-2 sm:col-span-4">
                <button type="button" onClick={() => load("acopio")} className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white hover:opacity-90">Aplicar filtros</button>
                {activeFilters > 0 && <button type="button" onClick={() => { setFVariedad(""); setFGrado(""); setFFrom(""); setFTo(""); load("acopio", { variedad: "", grado: "", from: "", to: "" }); }} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Limpiar</button>}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr>
                <Th>Lote</Th><Th>Fecha</Th><Th>Productor</Th><Th>Variedad</Th>
                <Th className="text-right">Peso (kg)</Th><Th className="text-right">Humedad</Th><Th>Grado</Th><Th className="text-right">Pagado</Th><Th className="text-right">Acción</Th>
              </tr></thead>
              <tbody>
                {lotes.map((l) => {
                  const annul = l.status === "anulado";
                  return (
                    <tr key={l.id} onClick={() => setLoteDrawerId(l.id)} className={`cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)] ${annul ? "opacity-50" : ""}`}>
                      <Td><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{l.loteCode}</span>{annul && <span className="ml-2 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">ANULADO</span>}</Td>
                      <Td className="text-[var(--text-secondary)]">{fdate(l.fecha)}</Td>
                      <Td className="font-medium text-[var(--text-primary)]">{l.productorNombre ?? "—"}</Td>
                      <Td className="text-[var(--text-secondary)]">{l.variedad ?? "—"} <span className="text-xs text-[var(--text-tertiary)]">{l.tipoGrano === "humedo" ? "(húmedo)" : ""}</span></Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n2(l.pesoKg)}</Td>
                      <Td className="text-right font-mono tabular-nums"><span className={l.humedadPct && Number(l.humedadPct) > 7 ? "text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>{l.humedadPct ? `${Number(l.humedadPct).toFixed(1)}%` : "—"}</span></Td>
                      <Td><GradoBadge grado={l.grado} /></Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}</Td>
                      <Td className="text-right">{annul ? <span className="text-xs text-[var(--text-tertiary)]">—</span> : <button type="button" onClick={(e) => { e.stopPropagation(); setAnnulId(l.id); setAnnulReason(""); }} className="inline-flex h-9 items-center rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)]">Anular</button>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={lotes.length === 0} icon={PackageCheck} msg="Sin lotes de acopio. Registrá el primero." />
          </div>
        </>
      )}

      {/* PRODUCTORES */}
      {view === "productores" && (
        <>
          <SearchBar value={search} onChange={setSearch} onEnter={() => load("productores")} placeholder="Buscar productor por nombre, código o sector…" />
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr><Th>Código</Th><Th>Nombre</Th><Th>DNI</Th><Th>Sector</Th><Th className="text-right">Ha</Th><Th>Variedad</Th><Th>Certificación</Th></tr></thead>
              <tbody>
                {producers.map((p) => (
                  <tr key={p.id} onClick={() => setProducerDrawerId(p.id)} className="cursor-pointer border-t border-[var(--rule-soft)] transition hover:bg-[var(--surface-sunken)]">
                    <Td><span className="font-mono text-xs font-bold text-[var(--text-tertiary)]">{p.codigo ?? "—"}</span></Td>
                    <Td className="font-medium text-[var(--text-primary)]">{p.nombre}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.dni ?? "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.sector ?? "—"}</Td>
                    <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.parcelaHa ? Number(p.parcelaHa).toFixed(1) : "—"}</Td>
                    <Td className="text-[var(--text-secondary)]">{p.variedad ?? "—"}</Td>
                    <Td>{p.certificacion ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">{p.certificacion.replace("_", " ")}</span> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={producers.length === 0} icon={Users} msg="Sin productores registrados. Agregá el primero." />
          </div>
        </>
      )}

      {/* BENEFICIO */}
      {view === "beneficio" && (
        <>
          <SearchBar value={search} onChange={setSearch} onEnter={() => load("beneficio")} placeholder="Buscar por código de lote…" />
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left"><tr>
                <Th>Lote</Th><Th>Estado</Th><Th className="text-right">Ferm. (días)</Th><Th className="text-right">Secado (días)</Th><Th>Método</Th>
                <Th className="text-right">Hum. final</Th><Th className="text-right">Húmedo→Seco</Th><Th className="text-right">Merma</Th>
              </tr></thead>
              <tbody>
                {beneficios.map((b) => {
                  const est = ESTADO_BENEFICIO[b.estado] ?? { label: b.estado, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
                  return (
                    <tr key={b.id} className="border-t border-[var(--rule-soft)]">
                      <Td><span className="font-mono text-xs font-bold text-[var(--text-primary)]">{b.loteCode ?? "—"}</span></Td>
                      <Td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${est.cls}`}>{est.label}</span></Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.fermDias ?? "—"}</Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.secDias ?? "—"}</Td>
                      <Td className="text-[var(--text-secondary)]">{b.metodoSecado ?? "—"}</Td>
                      <Td className="text-right font-mono tabular-nums"><span className={b.humedadFinal && Number(b.humedadFinal) > 7 ? "text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>{b.humedadFinal ? `${Number(b.humedadFinal).toFixed(1)}%` : "—"}</span></Td>
                      <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.pesoHumedoKg ? n2(b.pesoHumedoKg) : "—"} → {b.pesoSecoKg ? n2(b.pesoSecoKg) : "—"}</Td>
                      <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{b.mermaPct ? `${Number(b.mermaPct).toFixed(1)}%` : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <EmptyOrLoading loading={loading} empty={beneficios.length === 0} icon={Droplets} msg="Sin beneficios registrados. Registrá la fermentación/secado de un lote." />
          </div>
        </>
      )}

      {/* INVENTARIO */}
      {view === "inventario" && (
        <>
          {loading && !inventory ? (
            <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando inventario…</p></div>
          ) : inventory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Cacao seco disponible" value={`${n2(inventory.kgSecoDisponible)} kg`} subValue="listo para vender" icon={Warehouse} emphasis={inventory.kgSecoDisponible > 0 ? "success" : "neutral"} />
                <StatCard label="Valor estimado" value={`S/ ${n2(inventory.valorEstimado)}`} subValue={inventory.precioRefProm > 0 ? `a S/ ${inventory.precioRefProm.toFixed(2)}/kg acopio` : "sin precio ref."} icon={Coins} emphasis="neutral" />
                <StatCard label="En proceso (húmedo)" value={`${n2(inventory.kgHumedoProceso)} kg`} subValue={`${inventory.lotesEnProceso} lotes beneficiando`} icon={Droplets} emphasis="neutral" />
                <StatCard label="Seco proyectado" value={`${n2(inventory.kgSecoProyectado)} kg`} subValue="al terminar secado" icon={TrendingUp} emphasis="neutral" />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Composición del cacao seco disponible">
                  <Bar label="De beneficio (fermentado + secado)" value={inventory.kgSecoBeneficio} max={Math.max(inventory.kgSecoDisponible, 1)} unit="kg" />
                  <Bar label="Acopiado ya seco" value={inventory.kgSecoAcopiado} max={Math.max(inventory.kgSecoDisponible, 1)} unit="kg" />
                  <div className="mt-2 flex items-center justify-between border-t border-[var(--rule-soft)] pt-2 text-sm">
                    <span className="font-bold text-[var(--text-primary)]">Total disponible</span>
                    <span className="font-mono font-extrabold tabular-nums text-[var(--data-success-700)]">{n2(inventory.kgSecoDisponible)} kg</span>
                  </div>
                </Panel>
                <Panel title="Rendimiento del beneficio">
                  <div className="flex flex-col items-center justify-center gap-1 py-2">
                    <span className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">{inventory.rendimientoProm != null ? `${inventory.rendimientoProm}%` : "—"}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">kg seco obtenido por kg húmedo (promedio)</span>
                    <span className="mt-1 text-xs text-[var(--text-tertiary)]">Proyección usa merma típica ~60% cuando aún no hay peso seco real.</span>
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </>
      )}

      {/* RESUMEN */}
      {view === "resumen" && stats && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => printCacaoReporte(stats, trends)} className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Download className="h-4 w-4" />Imprimir reporte</button>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Kg acopiados" value={`${n2(stats.kgAcopiados)} kg`} subValue={`${stats.lotes} lotes`} icon={Scale} emphasis="success" />
            <StatCard label="Pagado a productores" value={`S/ ${n2(stats.valorPagado)}`} subValue={`${stats.productoresActivos} productores`} icon={Coins} emphasis="neutral" />
            <StatCard label="Índice ferm. prom." value={`${stats.indiceFermentacionProm}%`} icon={Leaf} emphasis={stats.indiceFermentacionProm >= 60 ? "success" : "warning"} />
            <StatCard label="Humedad en norma" value={`${stats.pctHumedadEnNorma}%`} subValue="≤ 7% (NTP 208.040)" icon={Scale} emphasis={stats.pctHumedadEnNorma >= 80 ? "success" : "warning"} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Kg por variedad">
              {stats.porVariedad.length === 0 ? <Muted /> : stats.porVariedad.map((v) => <Bar key={v.variedad} label={v.variedad} value={v.kg} max={stats.porVariedad[0].kg} unit="kg" />)}
            </Panel>
            <Panel title="Lotes por grado">
              {stats.porGrado.length === 0 ? <Muted /> : stats.porGrado.map((g) => (
                <div key={g.grado} className="flex items-center justify-between py-1.5 text-sm"><GradoBadge grado={g.grado === "sin_clasificar" ? null : g.grado} /><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{g.count}</span></div>
              ))}
            </Panel>
          </div>

          {trends && trends.humedadFueraCount > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-300)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-900)]">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <strong>{trends.humedadFueraCount} lote{trends.humedadFueraCount > 1 ? "s" : ""} con humedad fuera de norma</strong> (&gt; 7%).{" "}
                <span className="text-[var(--data-warning-800)]">{trends.humedadFuera.map((h) => `${h.loteCode} (${h.humedadPct.toFixed(1)}%)`).join(" · ")}</span>
              </div>
            </div>
          )}

          {trends && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Kg acopiados por mes">
                {trends.meses.length === 0 ? <Muted /> : (() => { const max = Math.max(...trends.meses.map((m) => m.kg), 1); return trends.meses.map((m) => <Bar key={m.mes} label={mesLabel(m.mes)} value={m.kg} max={max} unit="kg" />); })()}
              </Panel>
              <Panel title="Top productores (por pago)">
                {trends.topProductores.length === 0 ? <Muted /> : trends.topProductores.map((p, i) => (
                  <div key={p.nombre + i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">{i + 1}</span><span className="truncate text-[var(--text-primary)]">{p.nombre}</span></span>
                    <span className="flex shrink-0 items-center gap-3"><span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{n2(p.kg)} kg</span><span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">S/ {n2(p.pagado)}</span></span>
                  </div>
                ))}
              </Panel>
            </div>
          )}

          {trends?.calidad && (
            <Panel title={`Calidad promedio — prueba de corte (${trends.calidad.muestras} muestra${trends.calidad.muestras > 1 ? "s" : ""})`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CalidadCell icon={Award} label="Bien fermentado" value={trends.calidad.bien} tone="success" />
                <CalidadCell label="Violeta" value={trends.calidad.violeta} tone="warning" />
                <CalidadCell label="Pizarroso" value={trends.calidad.pizarroso} tone="danger" />
                <CalidadCell label="Mohoso" value={trends.calidad.mohoso} tone="danger" />
              </div>
            </Panel>
          )}
        </div>
      )}
      {view === "resumen" && loading && !stats && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando resumen…</p></div>}

      {/* MERCADO / NOTICIERO */}
      {view === "mercado" && <CacaoNoticiero />}

      {/* ASESOR */}
      {view === "asesor" && <CacaoAsesor />}

      {showLote && <CacaoLoteForm onClose={() => setShowLote(false)} onSaved={(o) => { if (!o?.keepOpen) setShowLote(false); load("acopio"); }} />}
      {showProducer && <CacaoProducerForm onClose={() => setShowProducer(false)} onSaved={() => { setShowProducer(false); load("productores"); }} />}
      {showBeneficio && <CacaoBeneficioForm onClose={() => setShowBeneficio(false)} onSaved={() => { setShowBeneficio(false); load("beneficio"); }} />}

      {loteDrawerId && <CacaoLoteDrawer loteId={loteDrawerId} onClose={() => setLoteDrawerId(null)} />}
      {producerDrawerId && (
        <CacaoProducerDrawer
          producerId={producerDrawerId}
          onClose={() => setProducerDrawerId(null)}
          onChanged={() => load("productores")}
          onOpenLote={(id) => { setProducerDrawerId(null); setLoteDrawerId(id); }}
        />
      )}

      {annulId && (
        <AdminModal open onClose={() => setAnnulId(null)} variant="centered-sm" hideCloseButton>
          <div className="bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--data-error-50)] text-[var(--data-error-600)]"><AlertTriangle className="h-6 w-6" /></span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Anular lote {lotes.find((l) => l.id === annulId)?.loteCode ?? ""}</h3>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">El lote queda marcado como anulado y sale de los totales. <strong className="text-[var(--text-secondary)]">No se borra</strong> — queda con su motivo en el historial.</p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Motivo de la anulación</span>
              <input autoFocus value={annulReason} onChange={(e) => setAnnulReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && annulReason.trim().length >= 3) annul(); }} placeholder="Ej: error de pesaje, lote duplicado…" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-error-500)]" />
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Mínimo 3 caracteres.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAnnulId(null)} className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
              <button type="button" disabled={annulReason.trim().length < 3} onClick={annul} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"><AlertTriangle className="h-4 w-4" />Anular lote</button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>; }
function SearchBar({ value, onChange, onEnter, placeholder }: { value: string; onChange: (v: string) => void; onEnter: () => void; placeholder: string }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
      <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter()} placeholder={placeholder} className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
    </div>
  );
}
function GradoBadge({ grado }: { grado: string | null }) {
  if (!grado) return <span className="text-xs text-[var(--text-tertiary)]">sin clasificar</span>;
  const g = grado as CacaoGrado;
  const cls = g === "I" ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : g === "II" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]" : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{GRADO_LABEL[g] ?? grado}</span>;
}
function EmptyOrLoading({ loading, empty, icon: Icon, msg }: { loading: boolean; empty: boolean; icon: typeof Leaf; msg: string }) {
  if (loading) return <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>;
  if (empty) return <div className="p-12 text-center text-[var(--text-tertiary)]"><Icon className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-base font-medium">{msg}</p></div>;
  return null;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"><h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">{title}</h3><div className="space-y-2">{children}</div></div>;
}
function Bar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{label}</span><span className="font-mono tabular-nums text-[var(--text-primary)]">{value.toFixed(2)} {unit}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Muted() { return <p className="text-sm text-[var(--text-tertiary)]">Sin datos todavía.</p>; }
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function mesLabel(mes: string) { const [y, m] = mes.split("-"); const idx = Number(m) - 1; return `${MESES[idx] ?? m} ${(y ?? "").slice(2)}`; }
function CalidadCell({ icon: Icon, label, value, tone }: { icon?: typeof Leaf; label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const cls = tone === "success" ? "text-[var(--data-success-700)]" : tone === "warning" ? "text-[var(--data-warning-700)]" : "text-[var(--data-error-700)]";
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{Icon && <Icon className="h-3 w-3" />}{label}</div>
      <div className={`mt-1 font-mono text-xl font-extrabold tabular-nums ${cls}`}>{value.toFixed(1)}%</div>
    </div>
  );
}
