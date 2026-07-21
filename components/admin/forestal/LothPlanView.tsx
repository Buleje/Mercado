"use client";

/**
 * LothPlanView — Plan de Manejo Forestal + especies autorizadas + censo (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, los volúmenes autorizados por
 * especie (con precio/m³) y el censo de árboles. La Tala jala de acá por código.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, TreePine, ShieldAlert, ShieldCheck, Upload, Trash2, Loader2, AlertCircle,
  Printer, MapPin, TrendingUp, Scale, Ban, AlertTriangle, CheckCircle2, Pencil, Check, X, Search,
} from "@buleje/design-system/icons";
import { CardTitle, StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";

interface Plan {
  id: string; planType: string; planNumber: string | null; tituloHabilitante: string | null;
  resolucionNumber: string | null; resolucionDate: string | null; titularName: string;
  arffs: string | null; region: string | null; parcelaCorta: string | null;
  areaHa: string | null; uitRef: string | null; vigenciaDesde: string | null;
  vigenciaHasta: string | null; estado: string;
}
interface Species {
  id: string; speciesCommon: string; speciesScientific: string | null; cites: boolean;
  categoria: string | null; volumenAutorizadoM3: string; arbolesAutorizados: number | null;
  valorEstadoNaturalSoles: string | null; precioVentaSoles: string | null;
}
interface Tree {
  id: string; treeCode: string; speciesCommon: string; speciesScientific: string | null;
  cites: boolean; dapM: string | null; alturaComercialM: string | null; factorForma: string | null;
  volumenEstimadoM3: string | null; utmZona: string | null; utmX: string | null; utmY: string | null;
  parcelaCorta: string | null; estado: string;
}
interface CensusStat { estado: string; count: number; volumenEstimadoM3: number; }

const n = (v: string | null, dp = 4) => (v == null || v === "" ? "—" : Number(v).toFixed(dp));
const soles = (v: string | null) => (v == null || v === "" ? "—" : `S/ ${Number(v).toFixed(2)}`);
const censusVol = (dap: number, hc: number, ff: number) =>
  dap > 0 && hc > 0 ? Math.round(0.7854 * dap * dap * hc * ff * 10000) / 10000 : 0;

export default function LothPlanView({ reloadSignal }: { reloadSignal?: number } = {}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [censusStat, setCensusStat] = useState<CensusStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const data = await r.json();
      setPlans(data.plans ?? []);
      if (!planId && data.plans?.[0]) setPlanId(data.plans[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [planId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [d, c, b] = await Promise.all([
        fetch(`/api/admin/forestal/plan?planId=${id}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/plan/census?planId=${id}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/plan?balance=${id}`, { credentials: "include" }),
      ]);
      if (d.ok) { const j = await d.json(); setSpecies(j.species ?? []); setCensusStat(j.censusSummary ?? []); }
      if (c.ok) setTrees((await c.json()).trees ?? []);
      if (b.ok) setBalance((await b.json()).balance ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // reloadSignal en deps: tras una tala/despacho el balance (loadDetail) se refresca solo.
  useEffect(() => { if (planId) loadDetail(planId); }, [planId, loadDetail, reloadSignal]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const autorizadoTotal = useMemo(() => species.reduce((a, s) => a + Number(s.volumenAutorizadoM3 ?? 0), 0), [species]);

  // Cruce censo ↔ autorizado ↔ movilizado por especie (compliance SERFOR/OSINFOR).
  const controlRows = useMemo(() => buildControlRows(species, trees, balance), [species, trees, balance]);
  const movilizadoTotal = useMemo(() => (balance?.rows ?? []).reduce((a, r) => a + r.movilizado, 0), [balance]);
  const aprovechamientoPct = autorizadoTotal > 0 ? (movilizadoTotal / autorizadoTotal) * 100 : 0;
  const saldoTotal = Math.max(0, autorizadoTotal - movilizadoTotal);
  const georrefCount = useMemo(() => trees.filter((t) => Number(t.utmX) && Number(t.utmY)).length, [trees]);
  const georrefPct = trees.length > 0 ? Math.round((georrefCount / trees.length) * 100) : 0;
  const noAutorizadas = controlRows.filter((r) => r.flags.includes("no_autorizada"));
  const okCount = controlRows.filter((r) => r.tone === "ok").length;
  // Nombres autorizados (normalizados) — el censo y el croquis marcan lo que cae fuera.
  const authorizedSet = useMemo(() => new Set(species.map((s) => normSp(s.speciesCommon))), [species]);

  return (
    <div className="space-y-5">
      {/* Selector de plan */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={planId ?? ""}
          onChange={(e) => setPlanId(e.target.value || null)}
          className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none"
        >
          {plans.length === 0 && <option value="">Sin planes</option>}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.planType} {p.planNumber ?? ""} — {p.titularName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowPlanForm((v) => !v)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nuevo plan
        </button>
        {planId && plan && (
          <button
            type="button"
            onClick={() => printInforme(plan, species, censusStat)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Printer className="h-4 w-4" /> Informe de ejecución
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      )}

      {showPlanForm && <PlanForm onClose={() => setShowPlanForm(false)} onSaved={() => { setShowPlanForm(false); loadPlans(); }} />}

      {loading && <div className="p-6 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}

      {!loading && plan && (
        <>
          {/* Carátula del plan */}
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]"><FileText className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Plan de Manejo · {plan.planType}
                </div>
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">{plan.titularName}</CardTitle>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
                  <Meta k="N° plan" v={plan.planNumber} />
                  <Meta k="Título hab." v={plan.tituloHabilitante} />
                  <Meta k="Resolución" v={plan.resolucionNumber} />
                  <Meta k="Parcela corta" v={plan.parcelaCorta} />
                  <Meta k="Región" v={plan.region} />
                  <Meta k="Área (ha)" v={plan.areaHa ? Number(plan.areaHa).toFixed(2) : null} />
                  <Meta k="Vigencia" v={fmtRange(plan.vigenciaDesde, plan.vigenciaHasta)} />
                  <Meta k="Estado" v={plan.estado} />
                </div>
              </div>
            </div>
          </div>

          {/* KPIs — StatCards del DS (consistencia visual con la vista Trazabilidad) */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Vol. autorizado" value={`${autorizadoTotal.toFixed(0)} m³`} subValue={`${species.length} especie${species.length === 1 ? "" : "s"}`} icon={FileText} emphasis="neutral" />
            <StatCard label="Aprovechamiento POA" value={`${aprovechamientoPct.toFixed(0)}%`} subValue={`${movilizadoTotal.toFixed(1)} m³ movilizados`} icon={TrendingUp} emphasis={aprovechamientoPct > 100 ? "error" : aprovechamientoPct >= 85 ? "warning" : "success"} />
            <StatCard label="Saldo disponible" value={`${saldoTotal.toFixed(1)} m³`} subValue={`${Math.max(0, 100 - aprovechamientoPct).toFixed(0)}% del POA`} icon={Scale} emphasis="success" />
            <StatCard label="Árboles censados" value={trees.length.toString()} subValue={`${georrefPct}% con GPS`} icon={TreePine} emphasis="neutral" />
            <StatCard label="Control de especies" value={`${okCount}/${controlRows.length}`} subValue={noAutorizadas.length > 0 ? `${noAutorizadas.length} fuera del plan` : "todo autorizado"} icon={noAutorizadas.length > 0 ? ShieldAlert : ShieldCheck} emphasis={noAutorizadas.length > 0 ? "error" : "success"} />
          </div>

          {/* Alertas de calidad del cruce censo ↔ autorizado (lo que el diseño viejo no atrapaba) */}
          <QualityAlerts rows={controlRows} />

          {/* Control por especie — ¿estoy dentro de lo autorizado? (compliance OSINFOR) */}
          <EspecieControlPanel rows={controlRows} loading={detailLoading} />

          {/* Balance de extracción / saldos — lente de dinero (pago derecho) */}
          <BalancePanel balance={balance} loading={detailLoading} vigenciaHasta={plan.vigenciaHasta} />

          {/* Especies autorizadas (editor) */}
          <SpeciesPanel planId={plan.id} species={species} onChange={() => loadDetail(plan.id)} />

          {/* Censo */}
          <CensusPanel planId={plan.id} trees={trees} authorizedSpecies={authorizedSet} onChange={() => loadDetail(plan.id)} />

          {/* Croquis de la parcela (UTM) */}
          <CensusMap trees={trees} authorizedSpecies={authorizedSet} />
        </>
      )}

      {!loading && plans.length === 0 && !showPlanForm && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center text-[var(--text-tertiary)]">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-base font-medium">No hay planes de manejo cargados.</p>
          <p className="mt-1 text-sm">Creá el plan (permiso + resolución + titular) para empezar a censar árboles.</p>
        </div>
      )}
    </div>
  );
}

// ─── Plan form ──────────────────────────────────────────────────────────────
function PlanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    planType: "PO", planNumber: "", tituloHabilitante: "", resolucionNumber: "", resolucionDate: "",
    titularName: "", arffs: "", region: "Ucayali", parcelaCorta: "", areaHa: "", uitRef: "5350",
    vigenciaDesde: "", vigenciaHasta: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || f.titularName.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.titularName = f.titularName.trim();
      const r = await fetch("/api/admin/forestal/plan", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include", body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]">{err}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Tipo"><select value={f.planType} onChange={(e) => set("planType", e.target.value)} className={cls}><option>PO</option><option>PMFI</option><option>DEMA</option></select></Field>
        <Field label="N° de plan"><input value={f.planNumber} onChange={(e) => set("planNumber", e.target.value)} placeholder="PO 12" className={cls} /></Field>
        <Field label="Título habilitante"><input value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls} /></Field>
        <Field label="N° resolución"><input value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2026..." className={cls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Titular *"><input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera ... SAC" required className={cls} /></Field>
        <Field label="ARFFS"><input value={f.arffs} onChange={(e) => set("arffs", e.target.value)} placeholder="GERFOR Ucayali" className={cls} /></Field>
        <Field label="Región"><input value={f.region} onChange={(e) => set("region", e.target.value)} onFocus={(e) => e.target.select()} className={cls} /></Field>
        <Field label="Parcela de corta"><input value={f.parcelaCorta} onChange={(e) => set("parcelaCorta", e.target.value)} placeholder="PC 12" className={cls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Fecha resolución"><input type="date" value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={cls} /></Field>
        <Field label="Área (ha)"><input type="number" step="0.01" value={f.areaHa} onChange={(e) => set("areaHa", e.target.value)} className={cls} /></Field>
        <Field label="Vigencia desde"><input type="date" value={f.vigenciaDesde} onChange={(e) => set("vigenciaDesde", e.target.value)} className={cls} /></Field>
        <Field label="Vigencia hasta"><input type="date" value={f.vigenciaHasta} onChange={(e) => set("vigenciaHasta", e.target.value)} className={cls} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={busy || f.titularName.trim().length < 2} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear plan"}
        </button>
      </div>
    </form>
  );
}

// ─── Especies ─────────────────────────────────────────────────────────────
function SpeciesPanel({ planId, species, onChange }: { planId: string; species: Species[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ speciesCommon: "", cites: false, volumenAutorizadoM3: "", arbolesAutorizados: "", precioVentaSoles: "", valorEstadoNaturalSoles: "" });
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ volumenAutorizadoM3: "", arbolesAutorizados: "", precioVentaSoles: "", valorEstadoNaturalSoles: "" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setE = (k: keyof typeof edit, v: string) => setEdit((p) => ({ ...p, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.speciesCommon.trim() || !(Number(f.volumenAutorizadoM3) > 0)) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    try {
      await fetch("/api/admin/forestal/plan/species", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, speciesCommon: f.speciesCommon.trim(), speciesScientific: matched?.scientificName ?? null,
          cites: f.cites || matched?.cites || false, volumenAutorizadoM3: Number(f.volumenAutorizadoM3),
          arbolesAutorizados: f.arbolesAutorizados ? Number(f.arbolesAutorizados) : null,
          precioVentaSoles: f.precioVentaSoles ? Number(f.precioVentaSoles) : null,
          valorEstadoNaturalSoles: f.valorEstadoNaturalSoles ? Number(f.valorEstadoNaturalSoles) : null,
        }),
      });
      setF({ speciesCommon: "", cites: false, volumenAutorizadoM3: "", arbolesAutorizados: "", precioVentaSoles: "", valorEstadoNaturalSoles: "" });
      onChange();
    } finally { setBusy(false); }
  }
  async function del(id: string) {
    // Confirmar: la especie autorizada alimenta el balance y la rentabilidad del libro.
    if (!window.confirm("¿Borrar esta especie autorizada del plan? Afecta el balance de saldo y la rentabilidad. Esta acción no se puede deshacer.")) return;
    await fetch(`/api/admin/forestal/plan/species?id=${id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
    onChange();
  }

  function startEdit(s: Species) {
    setEditingId(s.id);
    setEdit({
      volumenAutorizadoM3: s.volumenAutorizadoM3 ?? "",
      arbolesAutorizados: s.arbolesAutorizados != null ? String(s.arbolesAutorizados) : "",
      precioVentaSoles: s.precioVentaSoles ?? "",
      valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ?? "",
    });
  }
  async function saveEdit(id: string) {
    // PATCH: solo corrige los números de la autorización (vol/árboles/precio/VEN).
    // El nombre de la especie no se edita acá (rompería el cruce del control) —
    // para cambiarlo, borrar y volver a agregar.
    if (busy || !(Number(edit.volumenAutorizadoM3) > 0)) return;
    setBusy(true);
    try {
      await fetch("/api/admin/forestal/plan/species", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          id,
          volumenAutorizadoM3: Number(edit.volumenAutorizadoM3),
          arbolesAutorizados: edit.arbolesAutorizados ? Number(edit.arbolesAutorizados) : null,
          precioVentaSoles: edit.precioVentaSoles ? Number(edit.precioVentaSoles) : null,
          valorEstadoNaturalSoles: edit.valorEstadoNaturalSoles ? Number(edit.valorEstadoNaturalSoles) : null,
        }),
      });
      setEditingId(null);
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <Panel title="Especies autorizadas" action={<AddBtn open={open} onClick={() => setOpen((v) => !v)} />}>
      {open && (
        <form onSubmit={add} className="mb-3 grid grid-cols-2 items-end gap-2 rounded-xl bg-[var(--surface-canvas)] p-3 lg:grid-cols-6">
          <Field label="Especie"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" className={cls} /></Field>
          <Field label="Vol. autoriz. m³"><input type="number" step="0.0001" value={f.volumenAutorizadoM3} onChange={(e) => set("volumenAutorizadoM3", e.target.value)} className={cls} /></Field>
          <Field label="N° árboles"><input type="number" value={f.arbolesAutorizados} onChange={(e) => set("arbolesAutorizados", e.target.value)} className={cls} /></Field>
          <Field label="Precio S//m³"><input type="number" step="0.01" value={f.precioVentaSoles} onChange={(e) => set("precioVentaSoles", e.target.value)} className={cls} /></Field>
          <Field label="VEN S//m³"><input type="number" step="0.01" value={f.valorEstadoNaturalSoles} onChange={(e) => set("valorEstadoNaturalSoles", e.target.value)} className={cls} /></Field>
          <button type="submit" disabled={busy} className="h-10 rounded-lg bg-[var(--data-success-700)] text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Agregar</button>
        </form>
      )}
      <Table head={["Especie", "Vol. autoriz.", "N° árb.", "Precio/m³", "VEN/m³", ""]}>
        {species.map((s) => editingId === s.id ? (
          <tr key={s.id} className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
            <Cell><span className="font-medium text-[var(--text-primary)]">{s.speciesCommon}</span>{s.cites && <CitesPill />}</Cell>
            <Cell right><input type="number" step="0.0001" value={edit.volumenAutorizadoM3} onChange={(e) => setE("volumenAutorizadoM3", e.target.value)} className={editCls} /></Cell>
            <Cell right><input type="number" value={edit.arbolesAutorizados} onChange={(e) => setE("arbolesAutorizados", e.target.value)} className={editCls} /></Cell>
            <Cell right><input type="number" step="0.01" value={edit.precioVentaSoles} onChange={(e) => setE("precioVentaSoles", e.target.value)} className={editCls} /></Cell>
            <Cell right><input type="number" step="0.01" value={edit.valorEstadoNaturalSoles} onChange={(e) => setE("valorEstadoNaturalSoles", e.target.value)} className={editCls} /></Cell>
            <Cell right>
              <span className="inline-flex items-center gap-2">
                <button onClick={() => saveEdit(s.id)} disabled={busy} title="Guardar" className="text-[var(--data-success-700)] hover:opacity-80 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
                <button onClick={() => setEditingId(null)} title="Cancelar" className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><X className="h-4 w-4" /></button>
              </span>
            </Cell>
          </tr>
        ) : (
          <tr key={s.id} className="border-t border-[var(--rule-soft)]">
            <Cell><span className="font-medium text-[var(--text-primary)]">{s.speciesCommon}</span>{s.cites && <CitesPill />}{s.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{s.speciesScientific}</div>}</Cell>
            <Cell right><Mono>{n(s.volumenAutorizadoM3)}</Mono></Cell>
            <Cell right>{s.arbolesAutorizados ?? "—"}</Cell>
            <Cell right>{soles(s.precioVentaSoles)}</Cell>
            <Cell right>{soles(s.valorEstadoNaturalSoles)}</Cell>
            <Cell right>
              <span className="inline-flex items-center gap-2">
                <button onClick={() => startEdit(s)} title="Editar autorización" className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => del(s.id)} title="Borrar" className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button>
              </span>
            </Cell>
          </tr>
        ))}
        {species.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Sin especies. Agregá las aprobadas en la resolución.</td></tr>}
      </Table>
    </Panel>
  );
}

// ─── Censo ─────────────────────────────────────────────────────────────────
function CensusPanel({ planId, trees, authorizedSpecies, onChange }: { planId: string; trees: Tree[]; authorizedSpecies: Set<string>; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [f, setF] = useState({ treeCode: "", speciesCommon: "", dapM: "", alturaComercialM: "", factorForma: "0.65", utmZona: "18L", utmX: "", utmY: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const auto = censusVol(Number(f.dapM), Number(f.alturaComercialM), Number(f.factorForma) || 0.65);

  // Buscador (código/especie) + filtro por estado, sobre el censo completo.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trees.filter((t) => {
      if (estadoFilter !== "todos" && t.estado !== estadoFilter) return false;
      if (query && !`${t.treeCode} ${t.speciesCommon}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [trees, q, estadoFilter]);
  // Un árbol cuya especie NO está autorizada en el plan = tala potencialmente ilegal.
  const outOfPlan = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(normSp(name));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.treeCode.trim() || !f.speciesCommon.trim()) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    try {
      await fetch("/api/admin/forestal/plan/census", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, treeCode: f.treeCode.trim(), speciesCommon: f.speciesCommon.trim(),
          speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false,
          dapM: f.dapM ? Number(f.dapM) : null, alturaComercialM: f.alturaComercialM ? Number(f.alturaComercialM) : null,
          factorForma: Number(f.factorForma) || 0.65,
          utmZona: f.utmZona || null, utmX: f.utmX ? Number(f.utmX) : null, utmY: f.utmY ? Number(f.utmY) : null,
        }),
      });
      setF({ ...f, treeCode: "", dapM: "", alturaComercialM: "", utmX: "", utmY: "" });
      onChange();
    } finally { setBusy(false); }
  }

  async function doImport() {
    if (busy || !csv.trim()) return;
    setBusy(true); setMsg(null);
    // CSV: treeCode,especie,dap,hc,ff,utmZona,utmX,utmY
    const rows = csv.trim().split("\n").map((line) => {
      const c = line.split(/[,;\t]/).map((x) => x.trim());
      const matched = findSpeciesByCommonName(c[1] ?? "");
      return {
        treeCode: c[0], speciesCommon: c[1] ?? "", speciesScientific: matched?.scientificName ?? null,
        cites: matched?.cites ?? false,
        dapM: c[2] ? Number(c[2]) : null, alturaComercialM: c[3] ? Number(c[3]) : null,
        factorForma: c[4] ? Number(c[4]) : 0.65,
        utmZona: c[5] || null, utmX: c[6] ? Number(c[6]) : null, utmY: c[7] ? Number(c[7]) : null,
      };
    }).filter((r) => r.treeCode && r.speciesCommon);
    try {
      const r = await fetch("/api/admin/forestal/plan/census?bulk=1", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ planId, rows }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(`Importados ${j.creados ?? 0} árboles${j.errores?.length ? ` · ${j.errores.length} con error` : ""}.`);
      setCsv(""); onChange();
    } finally { setBusy(false); }
  }

  async function del(id: string) {
    // Confirmar: el árbol del censo es el punto de partida de la trazabilidad.
    if (!window.confirm("¿Borrar este árbol del censo? Es el origen de la cadena de custodia. Esta acción no se puede deshacer.")) return;
    await fetch(`/api/admin/forestal/plan/census?id=${id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
    onChange();
  }

  return (
    <Panel title={`Censo forestal (${trees.length})`} action={
      <div className="flex gap-2">
        <button type="button" onClick={() => setImporting((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Upload className="h-3.5 w-3.5" /> Importar CSV</button>
        <AddBtn open={open} onClick={() => setOpen((v) => !v)} />
      </div>
    }>
      {importing && (
        <div className="mb-3 space-y-2 rounded-xl bg-[var(--surface-canvas)] p-3">
          <p className="text-xs text-[var(--text-tertiary)]">Pegá una fila por árbol: <code className="font-mono">código,especie,DAP,altura,ff,zonaUTM,X,Y</code> (ej. <code className="font-mono">85-TOR,Tornillo,0.80,18,0.65,18L,545000,9000000</code>)</p>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder="85-TOR,Tornillo,0.80,18,0.65&#10;1-SHI,Shihuahuaco,0.96,16,0.65" className={`${cls} h-auto resize-none py-2 font-mono`} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={doImport} disabled={busy || !csv.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar"}</button>
            {msg && <span className="text-sm text-[var(--text-secondary)]">{msg}</span>}
          </div>
        </div>
      )}
      {open && (
        <form onSubmit={add} className="mb-3 grid grid-cols-2 items-end gap-2 rounded-xl bg-[var(--surface-canvas)] p-3 lg:grid-cols-7">
          <Field label="Código"><input value={f.treeCode} onChange={(e) => set("treeCode", e.target.value)} placeholder="85-TOR" className={cls} /></Field>
          <Field label="Especie"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" className={cls} /></Field>
          <Field label="DAP (m)"><input type="number" step="0.001" value={f.dapM} onChange={(e) => set("dapM", e.target.value)} className={cls} /></Field>
          <Field label="Hc (m)"><input type="number" step="0.01" value={f.alturaComercialM} onChange={(e) => set("alturaComercialM", e.target.value)} className={cls} /></Field>
          <Field label="ff"><input type="number" step="0.01" value={f.factorForma} onChange={(e) => set("factorForma", e.target.value)} className={cls} /></Field>
          <Field label={`Vol. est. ${auto > 0 ? auto.toFixed(4) : ""}`}><input disabled value={auto > 0 ? auto.toFixed(4) : ""} placeholder="auto" className={`${cls} opacity-70`} /></Field>
          <button type="submit" disabled={busy} className="h-10 rounded-lg bg-[var(--data-success-700)] text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Agregar</button>
        </form>
      )}
      {trees.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código o especie…"
              className={`${cls} pl-9`}
            />
          </div>
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none">
            <option value="todos">Todos los estados</option>
            <option value="en_pie">En pie</option>
            <option value="talado">Talado</option>
            <option value="descartado">Descartado</option>
          </select>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{filtered.length} de {trees.length}</span>
        </div>
      )}
      <Table head={["Código", "Especie", "DAP", "Hc", "Vol. est. m³", "UTM", "Estado", ""]}>
        {filtered.slice(0, 200).map((t) => {
          const fuera = outOfPlan(t.speciesCommon);
          return (
          <tr key={t.id} className={`border-t border-[var(--rule-soft)] ${fuera ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
            <Cell><Mono bold>{t.treeCode}</Mono></Cell>
            <Cell><span className="text-[var(--text-primary)]">{t.speciesCommon}</span>{t.cites && <CitesPill />}{fuera && <span className="ml-1.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">NO EN PLAN</span>}</Cell>
            <Cell right><Mono>{n(t.dapM, 2)}</Mono></Cell>
            <Cell right><Mono>{n(t.alturaComercialM, 2)}</Mono></Cell>
            <Cell right><Mono bold>{n(t.volumenEstimadoM3)}</Mono></Cell>
            <Cell><span className="text-xs text-[var(--text-tertiary)]">{t.utmZona ?? "—"}</span></Cell>
            <Cell><EstadoTag estado={t.estado} /></Cell>
            <Cell right><button onClick={() => del(t.id)} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button></Cell>
          </tr>
          );
        })}
        {trees.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agregá o importá el censo (CSV).</td></tr>}
        {trees.length > 0 && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún árbol coincide con el filtro.</td></tr>}
      </Table>
      {filtered.length > 200 && <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">Mostrando 200 de {filtered.length} árboles.</p>}
    </Panel>
  );
}

// ─── Balance de extracción / saldos ────────────────────────────────────────
interface BalanceRow {
  species: string; cites: boolean; autorizado: number; talado: number; movilizado: number;
  saldo: number; pctMovilizado: number; precioVenta: number; valorMovilizado: number;
  pagoDerecho: number; exceso: boolean;
}
interface Balance {
  rows: BalanceRow[]; pagoArea: number; pagoDerechoTotal: number; valorTotal: number;
  plan: { vigenciaHasta: string | null; estado: string; areaHa: number; uitRef: number } | null;
}

function BalancePanel({ balance: b, loading, vigenciaHasta }: { balance: Balance | null; loading: boolean; vigenciaHasta: string | null }) {
  // Alertas
  const alerts: { tone: "danger" | "warning"; text: string }[] = [];
  if (b) {
    for (const r of b.rows) {
      if (r.exceso) alerts.push({ tone: "danger", text: `${r.species}: aprovechamiento EXCEDE lo autorizado (${r.movilizado.toFixed(2)} > ${r.autorizado.toFixed(2)} m³) — requiere reformulación` });
      else if (r.autorizado > 0 && r.saldo / r.autorizado < 0.1) alerts.push({ tone: "warning", text: `${r.species}: saldo bajo (${r.saldo.toFixed(2)} m³ · ${(100 - r.pctMovilizado).toFixed(0)}% disponible)` });
    }
  }
  if (vigenciaHasta) {
    const dias = Math.ceil((new Date(vigenciaHasta).getTime() - Date.now()) / 86400000);
    if (dias < 0) alerts.push({ tone: "danger", text: `Vigencia del plan VENCIDA hace ${-dias} días` });
    else if (dias <= 30) alerts.push({ tone: "warning", text: `Vigencia del plan vence en ${dias} días` });
  }

  return (
    <Panel
      title="Balance de extracción · saldos"
      action={b ? <button type="button" onClick={() => printBalance(b)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-3.5 w-3.5" /> Imprimir</button> : undefined}
    >
      {loading && <div className="p-4 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
      {!loading && b && (
        <>
          {alerts.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${a.tone === "danger" ? "bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"}`}>
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.text}
                </div>
              ))}
            </div>
          )}
          <Table head={["Especie", "Autorizado", "Talado", "Movilizado", "Saldo", "% mov.", "Valor S/", "Pago derecho S/"]}>
            {b.rows.map((r) => (
              <tr key={r.species} className={`border-t border-[var(--rule-soft)] ${r.exceso ? "bg-[var(--data-error-50)]" : ""}`}>
                <Cell><span className="font-medium text-[var(--text-primary)]">{r.species}</span>{r.cites && <CitesPill />}</Cell>
                <Cell right><Mono>{r.autorizado.toFixed(2)}</Mono></Cell>
                <Cell right><Mono>{r.talado.toFixed(2)}</Mono></Cell>
                <Cell right><Mono>{r.movilizado.toFixed(2)}</Mono></Cell>
                <Cell right><span className={`font-mono tabular-nums font-bold ${r.saldo < 0 ? "text-[var(--data-error-700)]" : "text-[var(--data-success-700)]"}`}>{r.saldo.toFixed(2)}</span></Cell>
                <Cell right><SaldoBar pct={r.pctMovilizado} exceso={r.exceso} /></Cell>
                <Cell right>{r.valorMovilizado > 0 ? `S/ ${r.valorMovilizado.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</Cell>
                <Cell right>{r.pagoDerecho > 0 ? `S/ ${r.pagoDerecho.toFixed(2)}` : "—"}</Cell>
              </tr>
            ))}
            {b.rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Agregá especies autorizadas para ver el balance.</td></tr>}
          </Table>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-[var(--rule-soft)] pt-3 text-sm">
            <span><span className="text-[var(--text-tertiary)]">Valor movilizado: </span><span className="font-bold text-[var(--text-primary)]">S/ {b.valorTotal.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span><span className="text-[var(--text-tertiary)]">Pago por área (0.01% UIT × ha): </span><span className="font-bold text-[var(--text-primary)]">S/ {b.pagoArea.toFixed(2)}</span></span>
            <span><span className="text-[var(--text-tertiary)]">Pago derecho total: </span><span className="font-bold text-[var(--data-success-700)]">S/ {b.pagoDerechoTotal.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          </div>
        </>
      )}
    </Panel>
  );
}

// Impresión del balance de extracción (ventana nueva, aislada)
function printBalance(b: Balance) {
  const rows = b.rows.map((r) => `<tr${r.exceso ? ' style="background:#fde8e8"' : ""}><td>${r.species}${r.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${r.autorizado.toFixed(2)}</td><td style="text-align:right">${r.movilizado.toFixed(2)}</td><td style="text-align:right"><b>${r.saldo.toFixed(2)}</b></td><td style="text-align:right">${r.pctMovilizado.toFixed(0)}%</td><td style="text-align:right">${r.pagoDerecho.toFixed(2)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Balance de extracción</title>
  <style>body{font-family:Arial,sans-serif;color:#111;padding:28px;font-size:12px}h1{font-size:15px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:5px 7px}th{background:#f0f0f0;text-align:left}.k{color:#666}</style>
  </head><body onload="window.print()">
  <h1>BALANCE DE EXTRACCIÓN — SALDO DE MADERA</h1>
  <div class="k">Reporte interno (SERFOR) · autorizado − movilizado con GTF = saldo</div>
  <table><thead><tr><th>Especie</th><th>Autorizado m³</th><th>Movilizado m³</th><th>Saldo m³</th><th>% mov.</th><th>Pago derecho S/</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:10px;text-align:right">Pago por área (0.01% UIT × ha): <b>S/ ${b.pagoArea.toFixed(2)}</b> · Pago derecho total: <b>S/ ${b.pagoDerechoTotal.toFixed(2)}</b> · Valor movilizado: <b>S/ ${b.valorTotal.toFixed(2)}</b></div>
  </body></html>`;
  const w = window.open("", "_blank", "width=820,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Control por especie · cruce censo ↔ autorizado ↔ movilizado ────────────
// El corazón de la fiscalización OSINFOR: ¿lo censado/talado/movilizado cabe en
// lo que autorizó la resolución? Detecta especies fuera del plan (tala no
// autorizada), exceso de árboles y de volumen. Todo derivado en el cliente de
// datos ya cargados (species + trees + balance) — sin fetch extra.
type ControlFlag = "no_autorizada" | "exceso_volumen" | "exceso_arboles" | "sin_censo";
type ControlTone = "ok" | "warn" | "danger";
interface ControlRow {
  species: string; cites: boolean;
  autorizada: boolean; autorizadoM3: number; autorizadoArboles: number | null;
  censadoCount: number; censadoVolM3: number; georrefCount: number; taladoCount: number;
  movilizado: number; saldo: number; pctEjecutado: number;
  flags: ControlFlag[]; tone: ControlTone;
}

const normSp = (s: string) => s.trim().toLowerCase();

function buildControlRows(species: Species[], trees: Tree[], balance: Balance | null): ControlRow[] {
  const spMap = new Map(species.map((s) => [normSp(s.speciesCommon), s]));
  const balMap = new Map((balance?.rows ?? []).map((r) => [normSp(r.species), r]));
  const groups = new Map<string, { name: string; count: number; vol: number; georref: number; talado: number; cites: boolean }>();
  for (const t of trees) {
    const key = normSp(t.speciesCommon);
    const g = groups.get(key) ?? { name: t.speciesCommon, count: 0, vol: 0, georref: 0, talado: 0, cites: false };
    g.count += 1;
    g.vol += Number(t.volumenEstimadoM3 ?? 0);
    if (Number(t.utmX) && Number(t.utmY)) g.georref += 1;
    if (t.estado === "talado") g.talado += 1;
    g.cites = g.cites || t.cites;
    groups.set(key, g);
  }
  const keys = new Set<string>([...spMap.keys(), ...groups.keys()]);
  const rows: ControlRow[] = [];
  for (const key of keys) {
    const sp = spMap.get(key);
    const g = groups.get(key);
    const bal = balMap.get(key);
    const autorizada = !!sp;
    const autorizadoM3 = Number(sp?.volumenAutorizadoM3 ?? 0);
    const autorizadoArboles = sp?.arbolesAutorizados ?? null;
    const censadoCount = g?.count ?? 0;
    const movilizado = bal?.movilizado ?? 0;
    const saldo = bal ? bal.saldo : autorizadoM3 - movilizado;
    const pctEjecutado = autorizadoM3 > 0 ? (movilizado / autorizadoM3) * 100 : 0;
    const flags: ControlFlag[] = [];
    if (!autorizada && censadoCount > 0) flags.push("no_autorizada");
    if (bal?.exceso) flags.push("exceso_volumen");
    if (autorizadoArboles != null && censadoCount > autorizadoArboles) flags.push("exceso_arboles");
    if (autorizada && censadoCount === 0 && autorizadoM3 > 0) flags.push("sin_censo");
    const tone: ControlTone =
      flags.includes("no_autorizada") || flags.includes("exceso_volumen") ? "danger"
        : flags.includes("exceso_arboles") || flags.includes("sin_censo") ? "warn"
          : "ok";
    rows.push({
      species: sp?.speciesCommon ?? g?.name ?? key, cites: sp?.cites ?? g?.cites ?? false,
      autorizada, autorizadoM3, autorizadoArboles, censadoCount, censadoVolM3: g?.vol ?? 0,
      georrefCount: g?.georref ?? 0, taladoCount: g?.talado ?? 0, movilizado, saldo, pctEjecutado, flags, tone,
    });
  }
  const toneRank: Record<ControlTone, number> = { danger: 0, warn: 1, ok: 2 };
  rows.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.autorizadoM3 - a.autorizadoM3 || b.censadoVolM3 - a.censadoVolM3);
  return rows;
}

const FLAG_LABEL: Record<ControlFlag, string> = {
  no_autorizada: "Fuera del plan aprobado",
  exceso_volumen: "Movilizado excede autorizado",
  exceso_arboles: "Censo excede N° árboles autorizados",
  sin_censo: "Autorizada sin censo",
};

// Banner de calidad — surfacea lo que el diseño viejo dejaba pasar: una especie
// censada que NO figura en la resolución (ej. "Misa" en los datos demo).
function QualityAlerts({ rows }: { rows: ControlRow[] }) {
  const hasCenso = rows.some((r) => r.censadoCount > 0);
  if (!hasCenso) return null;
  const noAut = rows.filter((r) => r.flags.includes("no_autorizada"));
  const excArb = rows.filter((r) => r.flags.includes("exceso_arboles"));
  if (noAut.length === 0 && excArb.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 px-4 py-3 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Todo el censo corresponde a especies autorizadas en el plan.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {noAut.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 px-4 py-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-bold">Especie(s) censada(s) fuera del plan aprobado: </span>
            {noAut.map((r) => r.species).join(", ")}.{" "}
            <span className="font-medium">Talar o movilizar una especie no autorizada es infracción — corregí el plan o el censo antes de emitir GTF.</span>
          </div>
        </div>
      )}
      {excArb.map((r) => (
        <div key={r.species} className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 px-4 py-3 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><span className="font-bold">{r.species}:</span> censados {r.censadoCount} árboles &gt; {r.autorizadoArboles} autorizados en la resolución.</div>
        </div>
      ))}
    </div>
  );
}

function ControlToneDot({ tone }: { tone: ControlTone }) {
  const c = tone === "danger" ? "var(--data-error-500)" : tone === "warn" ? "var(--data-warning-500)" : "var(--data-success-500)";
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />;
}

function EspecieControlPanel({ rows, loading }: { rows: ControlRow[]; loading: boolean }) {
  return (
    <Panel title="Control por especie · censo ↔ autorizado">
      {loading && rows.length === 0 && <div className="p-4 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
      {(!loading || rows.length > 0) && (
        <>
          <Table head={["Especie", "Autorizado", "N° árb.", "Censado", "Talado", "Movilizado", "% ejec.", "Estado"]}>
            {rows.map((r) => (
              <tr key={r.species} className={`border-t border-[var(--rule-soft)] ${r.tone === "danger" ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
                <Cell>
                  <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]"><ControlToneDot tone={r.tone} />{r.species}</span>
                  {r.cites && <CitesPill />}
                  {!r.autorizada && <span className="ml-1.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">NO EN PLAN</span>}
                </Cell>
                <Cell right><Mono>{r.autorizada ? r.autorizadoM3.toFixed(2) : "—"}</Mono></Cell>
                <Cell right>
                  <span className={r.flags.includes("exceso_arboles") ? "font-bold text-[var(--data-warning-700)]" : "text-[var(--text-secondary)]"}>
                    {r.censadoCount}{r.autorizadoArboles != null ? ` / ${r.autorizadoArboles}` : ""}
                  </span>
                </Cell>
                <Cell right><Mono>{r.censadoVolM3.toFixed(2)}</Mono></Cell>
                <Cell right><Mono>{r.taladoCount}</Mono></Cell>
                <Cell right><Mono>{r.movilizado.toFixed(2)}</Mono></Cell>
                <Cell right><SaldoBar pct={r.pctEjecutado} exceso={r.flags.includes("exceso_volumen")} /></Cell>
                <Cell><span className="text-xs font-medium text-[var(--text-secondary)]">{r.flags.length === 0 ? "OK" : r.flags.map((f) => FLAG_LABEL[f]).join(" · ")}</span></Cell>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Agregá especies autorizadas y censá árboles para ver el control cruzado.</td></tr>}
          </Table>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Cruce entre lo que autorizó la resolución (m³ + N° de árboles), lo censado en campo y lo movilizado con GTF. Un fiscalizador de OSINFOR cruza exactamente estas columnas.
          </p>
        </>
      )}
    </Panel>
  );
}

// Informe de ejecución del POA — documento consolidado para ARFFS/SERFOR/OSINFOR al cierre
const SECTION_LABEL: Record<string, string> = {
  tala: "Tala", trozado: "Trozado", despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas", producto_terminado: "Producto terminado", despacho_producto: "Despacho de PT",
};
async function printInforme(plan: Plan, species: Species[], censusStat: CensusStat[]) {
  // Datos frescos: balance + totales por sección del libro
  let balance: Balance | null = null;
  let lothStats: Array<{ section: string; count: number; totalVolumeM3: number; totalQuantity: number }> = [];
  try {
    const [bRes, sRes] = await Promise.all([
      fetch(`/api/admin/forestal/plan?balance=${plan.id}`, { credentials: "include" }),
      fetch(`/api/admin/forestal/loth?stats=1`, { credentials: "include" }),
    ]);
    if (bRes.ok) balance = (await bRes.json()).balance ?? null;
    if (sRes.ok) lothStats = (await sRes.json()).stats ?? [];
  } catch { /* el informe se imprime con lo disponible */ }

  const d = (x: string | null) => (x ? new Date(x).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—");
  const balRows = (balance?.rows ?? []).map((r) => `<tr><td>${r.species}${r.cites ? " <b>(CITES)</b>" : ""}</td><td style="text-align:right">${r.autorizado.toFixed(2)}</td><td style="text-align:right">${r.movilizado.toFixed(2)}</td><td style="text-align:right"><b>${r.saldo.toFixed(2)}</b></td><td style="text-align:right">${r.pctMovilizado.toFixed(0)}%</td></tr>`).join("");
  const censoRows = censusStat.map((c) => `<tr><td>${c.estado === "en_pie" ? "En pie" : c.estado === "talado" ? "Talado" : "Descartado"}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">${c.volumenEstimadoM3.toFixed(2)}</td></tr>`).join("");
  const secRows = lothStats.map((s) => `<tr><td>${SECTION_LABEL[s.section] ?? s.section}</td><td style="text-align:right">${s.count}</td><td style="text-align:right">${s.totalVolumeM3.toFixed(2)}</td></tr>`).join("");
  const autorizadoTotal = species.reduce((a, s) => a + Number(s.volumenAutorizadoM3 ?? 0), 0);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Informe de ejecución — ${plan.planNumber ?? plan.planType}</title>
  <style>body{font-family:Arial,sans-serif;color:#111;padding:30px;font-size:12px}h1{font-size:16px;margin:0}h2{font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;margin:18px 0 6px}.sub{color:#555;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin-top:8px}.k{color:#666}.v{font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}th,td{border:1px solid #ccc;padding:4px 7px}th{background:#f0f0f0;text-align:left}.tot{text-align:right;margin-top:6px;font-size:12px}</style>
  </head><body onload="window.print()">
  <h1>INFORME DE EJECUCIÓN DEL PLAN DE MANEJO</h1>
  <div class="sub">Documento interno de gestión — base para el informe a ARFFS / SERFOR / OSINFOR al cierre del POA</div>
  <h2>Datos del título habilitante</h2>
  <div class="grid">
    <div><span class="k">Titular:</span> <span class="v">${plan.titularName}</span></div>
    <div><span class="k">Documento de gestión:</span> <span class="v">${plan.planType} ${plan.planNumber ?? ""}</span></div>
    <div><span class="k">Título habilitante:</span> <span class="v">${plan.tituloHabilitante ?? "—"}</span></div>
    <div><span class="k">Resolución:</span> <span class="v">${plan.resolucionNumber ?? "—"}</span></div>
    <div><span class="k">Parcela de corta:</span> <span class="v">${plan.parcelaCorta ?? "—"}</span></div>
    <div><span class="k">Área (ha):</span> <span class="v">${plan.areaHa ? Number(plan.areaHa).toFixed(2) : "—"}</span></div>
    <div><span class="k">Región / ARFFS:</span> <span class="v">${plan.region ?? "—"} / ${plan.arffs ?? "—"}</span></div>
    <div><span class="k">Vigencia:</span> <span class="v">${d(plan.vigenciaDesde)} → ${d(plan.vigenciaHasta)}</span></div>
  </div>
  <h2>Balance de extracción por especie</h2>
  <table><thead><tr><th>Especie</th><th>Autorizado m³</th><th>Movilizado m³</th><th>Saldo m³</th><th>% mov.</th></tr></thead><tbody>${balRows || '<tr><td colspan="5">Sin especies</td></tr>'}</tbody></table>
  ${balance ? `<div class="tot">Pago por área (0.01% UIT × ha): <b>S/ ${balance.pagoArea.toFixed(2)}</b> · Pago derecho total: <b>S/ ${balance.pagoDerechoTotal.toFixed(2)}</b> · Valor movilizado: <b>S/ ${balance.valorTotal.toFixed(2)}</b></div>` : ""}
  <h2>Resumen del censo</h2>
  <table><thead><tr><th>Estado del árbol</th><th>N° árboles</th><th>Vol. estimado m³</th></tr></thead><tbody>${censoRows || '<tr><td colspan="3">Sin censo</td></tr>'}</tbody></table>
  <h2>Movimientos registrados en el libro</h2>
  <table><thead><tr><th>Sección</th><th>N° líneas</th><th>Volumen m³</th></tr></thead><tbody>${secRows || '<tr><td colspan="3">Sin movimientos</td></tr>'}</tbody></table>
  <div class="tot">Volumen total autorizado en el plan: <b>${autorizadoTotal.toFixed(2)} m³</b></div>
  <div style="margin-top:34px;display:flex;justify-content:space-between"><div>______________________<br>Titular / Regente forestal</div><div>______________________<br>Fecha</div></div>
  </body></html>`;
  const w = window.open("", "_blank", "width=860,height=950");
  if (w) { w.document.write(html); w.document.close(); }
}

// Croquis de la parcela: scatter de árboles por coordenadas UTM (sin dependencias)
function CensusMap({ trees, authorizedSpecies }: { trees: Tree[]; authorizedSpecies: Set<string> }) {
  const pts = trees
    .map((t) => ({ t, x: Number(t.utmX), y: Number(t.utmY) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x !== 0 && p.y !== 0);
  if (pts.length === 0) return null;

  // Color por ESPECIE (paleta HSL determinística — sin hex hardcodeado), opacidad
  // por estado, y borde rojo punteado para especies fuera del plan autorizado.
  const speciesList = Array.from(new Set(pts.map((p) => p.t.speciesCommon)));
  const colorFor = (name: string) => `hsl(${Math.round((speciesList.indexOf(name) * 360) / Math.max(1, speciesList.length))} 60% 45%)`;
  const fuera = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(normSp(name));
  const opacityFor = (e: string) => (e === "talado" ? 0.5 : e === "descartado" ? 0.28 : 1);

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 760, H = 320, pad = 28;
  const sx = (x: number) => (maxX === minX ? W / 2 : pad + ((x - minX) / (maxX - minX)) * (W - 2 * pad));
  const sy = (y: number) => (maxY === minY ? H / 2 : H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad)); // Norte arriba

  return (
    <Panel title={`Croquis de la parcela · ${pts.length} árboles georreferenciados (UTM)`}>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }}>
          <text x={pad} y={16} fontSize="10" fill="var(--text-tertiary)">N ↑</text>
          {pts.map((p, i) => {
            const off = fuera(p.t.speciesCommon);
            return (
              <g key={i}>
                {off && <circle cx={sx(p.x)} cy={sy(p.y)} r={11} fill="none" stroke="var(--data-error-500)" strokeWidth={1.5} strokeDasharray="2.5 2" />}
                <circle cx={sx(p.x)} cy={sy(p.y)} r={7} fill={colorFor(p.t.speciesCommon)} fillOpacity={opacityFor(p.t.estado)} stroke={off ? "var(--data-error-500)" : "var(--surface-raised)"} strokeWidth={off ? 2 : 1.5}>
                  <title>{p.t.treeCode} · {p.t.speciesCommon}{off ? " · FUERA DEL PLAN" : ""} · {p.t.estado} · UTM {p.x},{p.y}</title>
                </circle>
                <text x={sx(p.x) + 9} y={sy(p.y) + 3} fontSize="9" fill="var(--text-secondary)">{p.t.treeCode}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Especie:</span>
        {speciesList.map((sp) => (
          <span key={sp} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(sp) }} />
            <span className={fuera(sp) ? "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : ""}>{sp}{fuera(sp) ? " ⚠" : ""}</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        Opacidad = estado (lleno: en pie · medio: talado · tenue: descartado). Borde rojo punteado = especie fuera del plan.
      </p>
    </Panel>
  );
}

function SaldoBar({ pct, exceso }: { pct: number; exceso: boolean }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <span className={`block h-full ${exceso ? "bg-[var(--data-error-500)]" : pct > 90 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-success-500)]"}`} style={{ width: `${w}%` }} />
      </span>
      <span className="font-mono tabular-nums text-xs text-[var(--text-secondary)]">{pct.toFixed(0)}%</span>
    </span>
  );
}

// ─── átomos ──────────────────────────────────────────────────────────────
const cls = "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]";
// Input compacto para edición inline dentro de celdas de tabla (alineado a la derecha).
const editCls = "w-24 h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</span>{children}</label>;
}
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <CardTitle as="h4" className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{title}</CardTitle>
        {action}
      </div>
      {children}
    </div>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-bold text-[var(--text-primary)] ${i >= 2 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Cell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 ${right ? "text-right" : ""}`}>{children}</td>;
}
function Mono({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{children}</span>;
}
function AddBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white hover:opacity-90"><Plus className="h-3.5 w-3.5" />{open ? "Cerrar" : "Agregar"}</button>;
}
function Meta({ k, v }: { k: string; v: string | null }) {
  return <div><span className="text-[var(--text-tertiary)]">{k}: </span><span className="font-medium text-[var(--text-primary)]">{v || "—"}</span></div>;
}
function CitesPill() {
  return <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]"><ShieldAlert className="h-2.5 w-2.5" />CITES</span>;
}
function EstadoTag({ estado }: { estado: string }) {
  const m: Record<string, string> = {
    en_pie: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
    talado: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
    descartado: "bg-[var(--data-error-100)] text-[var(--data-error-700)]",
  };
  const label: Record<string, string> = { en_pie: "En pie", talado: "Talado", descartado: "Descartado" };
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${m[estado] ?? "bg-[var(--surface-sunken)]"}`}>{label[estado] ?? estado}</span>;
}
function fmtRange(a: string | null, b: string | null) {
  const d = (x: string | null) => (x ? new Date(x).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null);
  if (!a && !b) return null;
  return `${d(a) ?? "?"} → ${d(b) ?? "?"}`;
}
