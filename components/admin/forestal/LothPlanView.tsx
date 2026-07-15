"use client";

/**
 * LothPlanView — Plan de Manejo Forestal + especies autorizadas + censo (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, los volúmenes autorizados por
 * especie (con precio/m³) y el censo de árboles. La Tala jala de acá por código.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, Plus, TreePine, ShieldAlert, Upload, Trash2, Loader2, AlertCircle, Printer, MapPin,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
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

export default function LothPlanView() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [censusStat, setCensusStat] = useState<CensusStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);

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
    try {
      const [d, c] = await Promise.all([
        fetch(`/api/admin/forestal/plan?planId=${id}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/plan/census?planId=${id}`, { credentials: "include" }),
      ]);
      if (d.ok) { const j = await d.json(); setSpecies(j.species ?? []); setCensusStat(j.censusSummary ?? []); }
      if (c.ok) setTrees((await c.json()).trees ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (planId) loadDetail(planId); }, [planId, loadDetail]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const autorizadoTotal = useMemo(() => species.reduce((a, s) => a + Number(s.volumenAutorizadoM3 ?? 0), 0), [species]);
  const censoVolTotal = useMemo(() => censusStat.reduce((a, s) => a + s.volumenEstimadoM3, 0), [censusStat]);
  const taladoVol = censusStat.find((s) => s.estado === "talado")?.volumenEstimadoM3 ?? 0;

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

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Vol. autorizado" value={`${autorizadoTotal.toFixed(2)} m³`} tone="success" />
            <Kpi label="Especies aprobadas" value={species.length.toString()} />
            <Kpi label="Árboles censados" value={trees.length.toString()} />
            <Kpi label="Vol. censo · talado" value={`${censoVolTotal.toFixed(1)} / ${taladoVol.toFixed(1)} m³`} />
          </div>

          {/* Balance de extracción / saldos */}
          <BalancePanel planId={plan.id} vigenciaHasta={plan.vigenciaHasta} />

          {/* Especies autorizadas */}
          <SpeciesPanel planId={plan.id} species={species} onChange={() => loadDetail(plan.id)} />

          {/* Censo */}
          <CensusPanel planId={plan.id} trees={trees} onChange={() => loadDetail(plan.id)} />

          {/* Croquis de la parcela (UTM) */}
          <CensusMap trees={trees} />
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
        <Field label="Región"><input value={f.region} onChange={(e) => set("region", e.target.value)} className={cls} /></Field>
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
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

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
    await fetch(`/api/admin/forestal/plan/species?id=${id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
    onChange();
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
        {species.map((s) => (
          <tr key={s.id} className="border-t border-[var(--rule-soft)]">
            <Cell><span className="font-medium text-[var(--text-primary)]">{s.speciesCommon}</span>{s.cites && <CitesPill />}{s.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{s.speciesScientific}</div>}</Cell>
            <Cell right><Mono>{n(s.volumenAutorizadoM3)}</Mono></Cell>
            <Cell right>{s.arbolesAutorizados ?? "—"}</Cell>
            <Cell right>{soles(s.precioVentaSoles)}</Cell>
            <Cell right>{soles(s.valorEstadoNaturalSoles)}</Cell>
            <Cell right><button onClick={() => del(s.id)} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button></Cell>
          </tr>
        ))}
        {species.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Sin especies. Agregá las aprobadas en la resolución.</td></tr>}
      </Table>
    </Panel>
  );
}

// ─── Censo ─────────────────────────────────────────────────────────────────
function CensusPanel({ planId, trees, onChange }: { planId: string; trees: Tree[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ treeCode: "", speciesCommon: "", dapM: "", alturaComercialM: "", factorForma: "0.65", utmZona: "18L", utmX: "", utmY: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const auto = censusVol(Number(f.dapM), Number(f.alturaComercialM), Number(f.factorForma) || 0.65);

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
      <Table head={["Código", "Especie", "DAP", "Hc", "Vol. est. m³", "UTM", "Estado", ""]}>
        {trees.slice(0, 200).map((t) => (
          <tr key={t.id} className="border-t border-[var(--rule-soft)]">
            <Cell><Mono bold>{t.treeCode}</Mono></Cell>
            <Cell><span className="text-[var(--text-primary)]">{t.speciesCommon}</span>{t.cites && <CitesPill />}</Cell>
            <Cell right><Mono>{n(t.dapM, 2)}</Mono></Cell>
            <Cell right><Mono>{n(t.alturaComercialM, 2)}</Mono></Cell>
            <Cell right><Mono bold>{n(t.volumenEstimadoM3)}</Mono></Cell>
            <Cell><span className="text-xs text-[var(--text-tertiary)]">{t.utmZona ?? "—"}</span></Cell>
            <Cell><EstadoTag estado={t.estado} /></Cell>
            <Cell right><button onClick={() => del(t.id)} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button></Cell>
          </tr>
        ))}
        {trees.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agregá o importá el censo (CSV).</td></tr>}
      </Table>
      {trees.length > 200 && <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">Mostrando 200 de {trees.length} árboles.</p>}
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

function BalancePanel({ planId, vigenciaHasta }: { planId: string; vigenciaHasta: string | null }) {
  const [b, setB] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/admin/forestal/plan?balance=${planId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel) setB(j?.balance ?? null); })
      .catch(() => { /* balance best-effort: el panel muestra vacío si falla */ })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [planId]);

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
function CensusMap({ trees }: { trees: Tree[] }) {
  const pts = trees
    .map((t) => ({ t, x: Number(t.utmX), y: Number(t.utmY) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x !== 0 && p.y !== 0);
  if (pts.length === 0) return null;

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 760, H = 320, pad = 28;
  const sx = (x: number) => (maxX === minX ? W / 2 : pad + ((x - minX) / (maxX - minX)) * (W - 2 * pad));
  const sy = (y: number) => (maxY === minY ? H / 2 : H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad)); // Norte arriba
  const color = (e: string) => (e === "talado" ? "var(--data-warning-500)" : e === "descartado" ? "var(--data-error-500)" : "var(--data-success-500)");

  return (
    <Panel title={`Croquis de la parcela · ${pts.length} árboles georreferenciados (UTM)`}>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }}>
          <text x={pad} y={16} fontSize="10" fill="var(--text-tertiary)">N ↑</text>
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={6} fill={color(p.t.estado)} stroke="var(--surface-raised)" strokeWidth={1.5}>
                <title>{p.t.treeCode} · {p.t.speciesCommon} · {p.t.estado} · UTM {p.x},{p.y}</title>
              </circle>
              <text x={sx(p.x) + 8} y={sy(p.y) + 3} fontSize="9" fill="var(--text-secondary)">{p.t.treeCode}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
        <MapPin className="h-3.5 w-3.5" />
        <Legend color="var(--data-success-500)" label="En pie" />
        <Legend color="var(--data-warning-500)" label="Talado" />
        <Legend color="var(--data-error-500)" label="Descartado" />
      </div>
    </Panel>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}</span>;
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
function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone === "success" ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]"}`}>{value}</div>
    </div>
  );
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
