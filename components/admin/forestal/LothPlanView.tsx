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
import { CardTitle, DataTable, StatCard } from "@buleje/design-system";
import { analizarPoa, defaultPoaConfig, CATEGORIA_COLOR, CATEGORIA_LABEL, type PoaAnalisis, type PoaConfig } from "@/lib/forestal/loth-poa";
import { printLothPoa } from "@/lib/forestal/loth-poa-print";
import { claveEspecie, mismaEspecie } from "@/lib/forestal/loth-constants";
import LothPoaPanel from "./LothPoaPanel";
import LothCensoImportModal from "./LothCensoImportModal";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import LothZafraPanel from "./LothZafraPanel";
import LothPlanTalaPanel from "./LothPlanTalaPanel";
import LothEspecieFichas, { type FichaEspecie } from "./LothEspecieFichas";
import LothEspecieFueraModal from "./LothEspecieFueraModal";
import { analizarZafra } from "@/lib/forestal/loth-zafra";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { toast } from "sonner";

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
/**
 * Cuántos árboles del censo se traen para calcular el Plan Operativo.
 *
 * Alto a propósito: un POA de mil hectáreas censa miles de árboles, y con un
 * tope bajo la pantalla mostraba un POA completo calculado sobre una parte
 * —medido: con 605 árboles y tope 500 quedaban 590 m³ afuera, invisibles—.
 * Si aun así se corta, el servidor avisa con `truncado` y la vista lo grita.
 */
const CENSO_LIMITE = 10_000;

const censusVol = (dap: number, hc: number, ff: number) =>
  dap > 0 && hc > 0 ? Math.round(0.7854 * dap * dap * hc * ff * 10000) / 10000 : 0;

export default function LothPlanView({ reloadSignal }: { reloadSignal?: number } = {}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  /** Cuántos árboles tiene el censo DE VERDAD, y si lo cargado se quedó corto. */
  const [censoTotal, setCensoTotal] = useState(0);
  const [censoTruncado, setCensoTruncado] = useState(false);
  /** La especie fuera del plan que se está resolviendo. */
  const [especieFuera, setEspecieFuera] = useState<string | null>(null);
  const [censusStat, setCensusStat] = useState<CensusStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [, setDetailLoading] = useState(false);
  // Plan Operativo: DMC por especie + % de semilleros (KV por plan).
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  const [poaSaving, setPoaSaving] = useState(false);

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
      const [d, c, b, poa] = await Promise.all([
        fetch(`/api/admin/forestal/plan?planId=${id}`, { credentials: "include" }),
        /* El límite va EXPLÍCITO: el POA se calcula sobre estas filas, así que
           cuánto se trae es una decisión de esta pantalla y no un default que
           puede cambiar en el servidor sin que nadie se entere. */
        fetch(`/api/admin/forestal/plan/census?planId=${id}&limit=${CENSO_LIMITE}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/plan?balance=${id}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/loth/poa?planId=${id}`, { credentials: "include" }),
      ]);
      if (d.ok) { const j = await d.json(); setSpecies(j.species ?? []); setCensusStat(j.censusSummary ?? []); }
      if (c.ok) {
        /* El `total` NO se descarta: el Plan Operativo se calcula sobre estas
           filas y, si el censo viene cortado, la pantalla tiene que decirlo en
           vez de mostrar un POA completo y equivocado. */
        const j = (await c.json()) as { trees?: Tree[]; total?: number; truncado?: boolean };
        setTrees(j.trees ?? []);
        setCensoTotal(j.total ?? (j.trees ?? []).length);
        setCensoTruncado(Boolean(j.truncado));
      }
      if (b.ok) setBalance((await b.json()).balance ?? null);
      if (poa.ok) setPoaConfig((await poa.json()).config ?? defaultPoaConfig());
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

  /**
   * Una ficha por especie: fusiona lo que antes vivía en TRES tablas.
   *
   * `ControlRow` ya cruzaba plan + censo + balance; lo que faltaba era traer
   * los m³ talados y la plata (valor movilizado, pago por derecho, precio) que
   * sólo estaban en el balance y en la lista de especies autorizadas. Con eso,
   * la especie se cuenta entera en una fila.
   */
  const fichasEspecie = useMemo<FichaEspecie[]>(() => {
    const bal = new Map((balance?.rows ?? []).map((r) => [claveEspecie(r.species), r]));
    const sp = new Map(species.map((e) => [claveEspecie(e.speciesCommon), e]));
    return controlRows.map((r) => {
      const b = bal.get(claveEspecie(r.species));
      const e = sp.get(claveEspecie(r.species));
      const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));
      return {
        species: r.species,
        cites: r.cites,
        autorizada: r.autorizada,
        autorizadoM3: r.autorizadoM3,
        autorizadoArboles: r.autorizadoArboles,
        censadoCount: r.censadoCount,
        censadoVolM3: r.censadoVolM3,
        taladoCount: r.taladoCount,
        taladoM3: b?.talado ?? 0,
        movilizado: r.movilizado,
        saldo: r.saldo,
        pctEjecutado: r.pctEjecutado,
        valorSoles: b?.valorMovilizado ?? null,
        pagoDerechoSoles: b?.pagoDerecho ?? null,
        precioM3: num(e?.precioVentaSoles),
        venM3: num(e?.valorEstadoNaturalSoles),
        motivos: r.flags.map((f) => FLAG_LABEL[f]),
        tone: r.tone,
        speciesId: e?.id ?? null,
      };
    });
  }, [controlRows, balance, species]);
  const movilizadoTotal = useMemo(() => (balance?.rows ?? []).reduce((a, r) => a + r.movilizado, 0), [balance]);
  const aprovechamientoPct = autorizadoTotal > 0 ? (movilizadoTotal / autorizadoTotal) * 100 : 0;
  const saldoTotal = Math.max(0, autorizadoTotal - movilizadoTotal);
  const georrefCount = useMemo(() => trees.filter((t) => Number(t.utmX) && Number(t.utmY)).length, [trees]);
  const georrefPct = trees.length > 0 ? Math.round((georrefCount / trees.length) * 100) : 0;
  const noAutorizadas = controlRows.filter((r) => r.flags.includes("no_autorizada"));
  const okCount = controlRows.filter((r) => r.tone === "ok").length;
  // Nombres autorizados (normalizados) — el censo y el croquis marcan lo que cae fuera.
  const authorizedSet = useMemo(() => new Set(species.map((s) => claveEspecie(s.speciesCommon))), [species]);

  /**
   * El POA cruza el censo con el DMC de cada especie: cuántos árboles se pueden
   * tumbar de verdad, cuántos quedan de semilleros y con qué intensidad.
   */
  const poa: PoaAnalisis = useMemo(
    () =>
      analizarPoa({
        trees: trees.map((t) => ({
          id: t.id,
          treeCode: t.treeCode,
          speciesCommon: t.speciesCommon,
          dapM: t.dapM != null && t.dapM !== "" ? Number(t.dapM) : null,
          volumenEstimadoM3: t.volumenEstimadoM3 != null ? Number(t.volumenEstimadoM3) : null,
          estado: t.estado,
        })),
        species: species.map((s) => ({
          speciesCommon: s.speciesCommon,
          volumenAutorizadoM3: Number(s.volumenAutorizadoM3 ?? 0),
          arbolesAutorizados: s.arbolesAutorizados,
        })),
        areaHa: plan?.areaHa != null ? Number(plan.areaHa) : null,
        config: poaConfig,
      }),
    [trees, species, plan, poaConfig],
  );
  /** Categoría POA por árbol — la muestra el censo como badge. */
  const categoriaPorArbol = useMemo(() => new Map(poa.arboles.map((a) => [a.id, a.categoria])), [poa.arboles]);

  /* Lo que necesita el plan de tala: el árbol con su categoría del POA (que es
     la que decide si se puede tumbar) y el saldo VIVO por especie, que sale del
     balance —autorizado menos movilizado— y no del volumen autorizado a secas. */
  const arbolesParaTalar = useMemo(
    () =>
      trees.map((t) => ({
        id: t.id,
        treeCode: t.treeCode,
        especie: t.speciesCommon,
        volumenM3: Number(t.volumenEstimadoM3 ?? 0),
        categoria: categoriaPorArbol.get(t.id) ?? "sin_dap",
        estado: t.estado,
        utmX: t.utmX != null && t.utmX !== "" ? Number(t.utmX) : null,
        utmY: t.utmY != null && t.utmY !== "" ? Number(t.utmY) : null,
        parcela: t.parcelaCorta,
      })),
    [trees, categoriaPorArbol],
  );
  const saldosPorEspecie = useMemo(
    () => fichasEspecie.filter((f) => f.autorizada && f.autorizadoM3 > 0).map((f) => ({ especie: f.species, saldoM3: f.saldo })),
    [fichasEspecie],
  );

  /**
   * Zafra: el saldo autorizado NO se acumula al período siguiente, así que el
   * avance se mide contra la vigencia del plan. `hoy` entra por parámetro para
   * que el cálculo sea puro y testeable.
   */
  const zafra = useMemo(
    () =>
      analizarZafra({
        vigenciaDesde: plan?.vigenciaDesde ?? null,
        vigenciaHasta: plan?.vigenciaHasta ?? null,
        autorizadoM3: autorizadoTotal,
        movilizadoM3: movilizadoTotal,
        hoy: new Date(),
      }),
    [plan, autorizadoTotal, movilizadoTotal],
  );

  const savePoaConfig = useCallback(async () => {
    if (!planId) return;
    setPoaSaving(true);
    try {
      const r = await fetch("/api/admin/forestal/loth/poa", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ planId, dmcOverrides: poaConfig.dmcOverrides, semillerosPct: poaConfig.semillerosPct }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setPoaConfig((await r.json()).config ?? poaConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoaSaving(false);
    }
  }, [planId, poaConfig]);

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
          onClick={() => setShowPlanForm(true)}
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

      {/* El plan es la base maestra del libro: se carga en un modal enfocado, no
          en un panel que empuja el resto de la pestaña fuera de la vista. */}
      <AdminModal
        open={showPlanForm}
        onClose={() => setShowPlanForm(false)}
        title="Nuevo plan de manejo"
        description="El permiso aprobado que autoriza el aprovechamiento. De acá cuelgan las especies y el censo."
        icon={FileText}
        variant="wide"
      >
        {showPlanForm && <PlanForm onClose={() => setShowPlanForm(false)} onSaved={() => { setShowPlanForm(false); loadPlans(); }} />}
      </AdminModal>

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
            <StatCard density="compact" label="Vol. autorizado" value={`${autorizadoTotal.toFixed(0)} m³`} subValue={`${species.length} especie${species.length === 1 ? "" : "s"}`} icon={FileText} emphasis="neutral" />
            <StatCard density="compact" label="Aprovechamiento POA" value={`${aprovechamientoPct.toFixed(0)}%`} subValue={`${movilizadoTotal.toFixed(1)} m³ movilizados`} icon={TrendingUp} emphasis={aprovechamientoPct > 100 ? "error" : aprovechamientoPct >= 85 ? "warning" : "success"} />
            <StatCard density="compact" label="Saldo disponible" value={`${saldoTotal.toFixed(1)} m³`} subValue={`${Math.max(0, 100 - aprovechamientoPct).toFixed(0)}% del POA`} icon={Scale} emphasis="success" />
            <StatCard density="compact" label="Árboles censados" value={censoTotal.toString()} subValue={censoTruncado ? `calculando sobre ${trees.length}` : `${georrefPct}% con GPS`} icon={TreePine} emphasis={censoTruncado ? "warning" : "neutral"} />
            <StatCard density="compact" label="Control de especies" value={`${okCount}/${controlRows.length}`} subValue={noAutorizadas.length > 0 ? `${noAutorizadas.length} fuera del plan` : "todo autorizado"} icon={noAutorizadas.length > 0 ? ShieldAlert : ShieldCheck} emphasis={noAutorizadas.length > 0 ? "error" : "success"} />
          </div>

          {/* ⛔ Antes que cualquier otro número: si el censo vino cortado, TODO
              lo que sigue —aprovechables, volumen sobre DMC, intensidad por
              hectárea, el cuadre por especie— está calculado sobre una parte. Un
              POA equivocado que se ve completo es peor que uno que falta. */}
          {censoTruncado && (
            <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                El censo tiene {censoTotal.toLocaleString("es-PE")} árboles y se cargaron {trees.length.toLocaleString("es-PE")}.
                Todo el Plan Operativo de abajo está calculado sobre esos {trees.length.toLocaleString("es-PE")}: no lo uses para declarar
                hasta filtrar por parcela o estado.
              </span>
            </p>
          )}

          {/* Alertas de calidad del cruce censo ↔ autorizado (lo que el diseño viejo no atrapaba) */}
          <QualityAlerts rows={controlRows} onResolver={setEspecieFuera} />

          {/* Plan Operativo: qué se puede tumbar de verdad (DMC + semilleros) */}
          <LothPoaPanel
            analisis={poa}
            config={poaConfig}
            saving={poaSaving}
            onConfig={setPoaConfig}
            onSave={savePoaConfig}
            onPrint={() =>
              printLothPoa(poa, {
                titular: plan.titularName,
                tituloHabilitante: plan.tituloHabilitante,
                planNumber: plan.planNumber,
                planType: plan.planType,
                resolucion: plan.resolucionNumber,
                arffs: plan.arffs,
                parcelaCorta: plan.parcelaCorta,
                vigencia: plan.vigenciaHasta,
              })
            }
          />

          {/* Zafra: ¿llego con los tiempos de la vigencia? */}
          <LothZafraPanel zafra={zafra} />

          {/* Y el paso que faltaba: con qué árboles se llega a ese ritmo. */}
          <LothPlanTalaPanel
            arboles={arbolesParaTalar}
            saldos={saldosPorEspecie}
            ritmoRequeridoM3Dia={zafra.ritmoRequeridoM3Dia}
            diasRestantes={zafra.diasRestantes}
            saldoTotalM3={zafra.saldoM3}
          />

          {/* UNA ficha por especie: reemplaza «Control por especie» y «Balance de
              extracción», que eran dos cuadros de ocho columnas repitiendo la
              misma especie y el mismo «autorizado». */}
          <LothEspecieFichas
            fichas={fichasEspecie}
            pagoArea={balance?.pagoArea ?? null}
            pagoDerechoTotal={balance?.pagoDerechoTotal ?? null}
            valorTotal={balance?.valorTotal ?? null}
          />

          {/* El EDITOR de especies autorizadas. Su tabla repite lo que la ficha
              de arriba ya muestra —volumen, árboles, precio—, pero es el único
              lugar para dar de alta y corregir, así que se queda con el título
              diciendo qué es: acá se edita, arriba se lee. */}
          <SpeciesPanel planId={plan.id} species={species} onChange={() => loadDetail(plan.id)} />

          {/* Censo */}
          <CensusPanel
            planId={plan.id}
            trees={trees}
            total={censoTotal}
            truncado={censoTruncado}
            authorizedSpecies={authorizedSet}
            categorias={categoriaPorArbol}
            dmcOverrides={poaConfig.dmcOverrides}
            onChange={() => loadDetail(plan.id)}
          />

          {especieFuera && (
            <LothEspecieFueraModal
              planId={plan.id}
              especie={especieFuera}
              arboles={trees
                .filter((t) => mismaEspecie(t.speciesCommon, especieFuera))
                .map((t) => ({ id: t.id, treeCode: t.treeCode, volumenEstimadoM3: t.volumenEstimadoM3, estado: t.estado }))}
              resolucion={plan.resolucionNumber}
              onClose={() => setEspecieFuera(null)}
              onResuelto={() => loadDetail(plan.id)}
            />
          )}

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
    <form onSubmit={submit} className="space-y-4 p-5">
      {err && <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{err}</div>}
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
      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button type="submit" disabled={busy || f.titularName.trim().length < 2} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear plan
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
  const { confirm } = useConfirm();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.speciesCommon.trim() || !(Number(f.volumenAutorizadoM3) > 0)) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    try {
      const r = await fetch("/api/admin/forestal/plan/species", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, speciesCommon: f.speciesCommon.trim(), speciesScientific: matched?.scientificName ?? null,
          cites: f.cites || matched?.cites || false, volumenAutorizadoM3: Number(f.volumenAutorizadoM3),
          arbolesAutorizados: f.arbolesAutorizados ? Number(f.arbolesAutorizados) : null,
          precioVentaSoles: f.precioVentaSoles ? Number(f.precioVentaSoles) : null,
          valorEstadoNaturalSoles: f.valorEstadoNaturalSoles ? Number(f.valorEstadoNaturalSoles) : null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo agregar la especie (error ${r.status})`);
        return;
      }
      setF({ speciesCommon: "", cites: false, volumenAutorizadoM3: "", arbolesAutorizados: "", precioVentaSoles: "", valorEstadoNaturalSoles: "" });
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] agregar especie falló", err);
      toast.error("No se pudo agregar la especie — revisá tu conexión.");
    } finally { setBusy(false); }
  }
  async function del(s: Species) {
    // La especie autorizada alimenta el balance y la rentabilidad del libro: se
    // confirma con el diálogo del DS (accesible, con foco atrapado), no con el
    // `window.confirm` del navegador, que además ignora el tema.
    const ok = await confirm({
      title: `¿Borrar ${s.speciesCommon} del plan?`,
      description: `Se quitan ${s.volumenAutorizadoM3 ?? "—"} m³ autorizados. Afecta el balance de saldo y la rentabilidad del libro. No se puede deshacer.`,
      intent: "danger",
      confirmLabel: "Sí, borrar la especie",
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/admin/forestal/plan/species?id=${s.id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo borrar la especie (error ${r.status})`);
        return;
      }
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] borrar especie falló", err);
      toast.error("No se pudo borrar la especie — revisá tu conexión.");
    }
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
      const r = await fetch("/api/admin/forestal/plan/species", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          id,
          volumenAutorizadoM3: Number(edit.volumenAutorizadoM3),
          arbolesAutorizados: edit.arbolesAutorizados ? Number(edit.arbolesAutorizados) : null,
          precioVentaSoles: edit.precioVentaSoles ? Number(edit.precioVentaSoles) : null,
          valorEstadoNaturalSoles: edit.valorEstadoNaturalSoles ? Number(edit.valorEstadoNaturalSoles) : null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo guardar la especie (error ${r.status})`);
        return;
      }
      setEditingId(null);
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] guardar especie falló", err);
      toast.error("No se pudo guardar la especie — revisá tu conexión.");
    } finally { setBusy(false); }
  }

  return (
    <Panel title="Editar especies autorizadas" action={<AddBtn onClick={() => setOpen(true)} />}>
      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar especie autorizada"
        description="Lo que el plan permite aprovechar de esta especie. El libro controla el saldo contra este volumen."
        icon={TreePine}
        variant="wide"
      >
        <form onSubmit={add} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Especie *"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" autoFocus className={cls} /></Field>
            <Field label="Volumen autorizado (m³) *"><input type="number" step="0.0001" value={f.volumenAutorizadoM3} onChange={(e) => set("volumenAutorizadoM3", e.target.value)} placeholder="120.5" className={cls} /></Field>
            <Field label="N° de árboles autorizados"><input type="number" value={f.arbolesAutorizados} onChange={(e) => set("arbolesAutorizados", e.target.value)} placeholder="45" className={cls} /></Field>
            <Field label="Precio de venta (S/ por m³)"><input type="number" step="0.01" value={f.precioVentaSoles} onChange={(e) => set("precioVentaSoles", e.target.value)} placeholder="850.00" className={cls} /></Field>
            <Field label="Valor en estado natural (S/ por m³)"><input type="number" step="0.01" value={f.valorEstadoNaturalSoles} onChange={(e) => set("valorEstadoNaturalSoles", e.target.value)} placeholder="12.50" className={cls} /></Field>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">El VEN es la base del derecho de aprovechamiento que se paga al Estado; el precio de venta alimenta la rentabilidad del libro.</p>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" disabled={busy || !f.speciesCommon.trim() || !(Number(f.volumenAutorizadoM3) > 0)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar especie
            </button>
          </div>
        </form>
      </AdminModal>
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
                <button onClick={() => void del(s)} title={`Borrar ${s.speciesCommon}`} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button>
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
function CensusPanel({ planId, trees, total, truncado, authorizedSpecies, categorias, dmcOverrides, onChange }: {
  planId: string; trees: Tree[]; total: number; truncado: boolean; authorizedSpecies: Set<string>;
  /** DMC fijado por el plan — el importador avisa si una fila cae por debajo. */
  dmcOverrides: Record<string, number>;
  /** Categoría POA por árbol (aprovechable / semillero / bajo DMC…). */
  categorias: Map<string, keyof typeof CATEGORIA_LABEL>;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [catFilter, setCatFilter] = useState("todas");
  /** Cuántas filas se pintan. Un censo real tiene miles y el DOM no las aguanta. */
  const [visibles, setVisibles] = useState(200);
  const [f, setF] = useState({ treeCode: "", speciesCommon: "", dapM: "", alturaComercialM: "", factorForma: "0.65", utmZona: "18L", utmX: "", utmY: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const auto = censusVol(Number(f.dapM), Number(f.alturaComercialM), Number(f.factorForma) || 0.65);

  // Buscador (código/especie) + filtro por estado, sobre el censo completo.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return trees.filter((t) => {
      if (estadoFilter !== "todos" && t.estado !== estadoFilter) return false;
      if (catFilter !== "todas" && categorias.get(t.id) !== catFilter) return false;
      if (query && !`${t.treeCode} ${t.speciesCommon}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [trees, q, estadoFilter, catFilter, categorias]);
  // Un árbol cuya especie NO está autorizada en el plan = tala potencialmente ilegal.
  const outOfPlan = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(claveEspecie(name));
  const { confirm } = useConfirm();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.treeCode.trim() || !f.speciesCommon.trim()) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    try {
      const r = await fetch("/api/admin/forestal/plan/census", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, treeCode: f.treeCode.trim(), speciesCommon: f.speciesCommon.trim(),
          speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false,
          dapM: f.dapM ? Number(f.dapM) : null, alturaComercialM: f.alturaComercialM ? Number(f.alturaComercialM) : null,
          factorForma: Number(f.factorForma) || 0.65,
          utmZona: f.utmZona || null, utmX: f.utmX ? Number(f.utmX) : null, utmY: f.utmY ? Number(f.utmY) : null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo agregar el árbol (error ${r.status})`);
        return;
      }
      setF({ ...f, treeCode: "", dapM: "", alturaComercialM: "", utmX: "", utmY: "" });
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] agregar árbol falló", err);
      toast.error("No se pudo agregar el árbol — revisá tu conexión.");
    } finally { setBusy(false); }
  }
  /** Importa las filas ya validadas por el modal (shape del endpoint bulk). */
  async function doImport(filas: Record<string, unknown>[]) {
    if (busy || filas.length === 0) return;
    setBusy(true); setMsg(null);
    const rows = filas.map((f) => {
      const matched = findSpeciesByCommonName(String(f.speciesCommon ?? ""));
      return { ...f, speciesScientific: matched?.scientificName ?? null, cites: matched?.cites ?? false };
    });
    try {
      const r = await fetch("/api/admin/forestal/plan/census?bulk=1", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ planId, rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(typeof j?.error === "string" ? j.error : `No se pudo importar el censo (error ${r.status})`);
        return;
      }
      setMsg(`Importados ${j.creados ?? 0} árboles${j.errores?.length ? ` · ${j.errores.length} con error` : ""}.`);
      setImporting(false); onChange();
    } catch (err) {
      console.warn("[LothPlanView] importar censo falló", err);
      toast.error("No se pudo importar el censo — revisá tu conexión.");
    } finally { setBusy(false); }
  }

  async function del(t: Tree) {
    // El árbol del censo es el punto de partida de la trazabilidad: si ya fue
    // talado, borrarlo deja la cadena sin origen. Se avisa con nombre y código.
    const ok = await confirm({
      title: `¿Borrar el árbol ${t.treeCode} del censo?`,
      description: `${t.speciesCommon ?? "Sin especie"} · es el origen de la cadena de custodia. Si ya se taló, su trazabilidad queda sin punto de partida. No se puede deshacer.`,
      intent: "danger",
      confirmLabel: "Sí, borrar el árbol",
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/admin/forestal/plan/census?id=${t.id}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(typeof body?.error === "string" ? body.error : `No se pudo borrar el árbol (error ${r.status})`);
        return;
      }
      onChange();
    } catch (err) {
      console.warn("[LothPlanView] borrar árbol falló", err);
      toast.error("No se pudo borrar el árbol — revisá tu conexión.");
    }
  }

  return (
    <Panel title={`Censo forestal (${total.toLocaleString("es-PE")})`} action={
      <div className="flex gap-2">
        <button type="button" onClick={() => setImporting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Upload className="h-3.5 w-3.5" /> Importar censo</button>
        <AddBtn onClick={() => setOpen(true)} />
      </div>
    }>
      <LothCensoImportModal
        open={importing}
        importing={busy}
        ctx={{
          codigosExistentes: new Set(trees.map((t) => t.treeCode.toLowerCase())),
          especiesAutorizadas: authorizedSpecies,
          dmcOverrides,
        }}
        onClose={() => setImporting(false)}
        onImport={doImport}
      />
      {msg && <p className="mb-3 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{msg}</p>}
      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar árbol al censo"
        description="Cada árbol censado es el punto de partida de la cadena de custodia; la Tala lo jala por su código."
        icon={TreePine}
        variant="wide"
      >
        <form onSubmit={add} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Código del árbol *"><input value={f.treeCode} onChange={(e) => set("treeCode", e.target.value)} placeholder="85-TOR" autoFocus className={cls} /></Field>
            <Field label="Especie *"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" className={cls} /></Field>
            <Field label="DAP — diámetro a la altura del pecho (m)"><input type="number" step="0.001" value={f.dapM} onChange={(e) => set("dapM", e.target.value)} placeholder="0.850" className={cls} /></Field>
            <Field label="Altura comercial (m)"><input type="number" step="0.01" value={f.alturaComercialM} onChange={(e) => set("alturaComercialM", e.target.value)} placeholder="18.00" className={cls} /></Field>
            <Field label="Factor de forma"><input type="number" step="0.01" value={f.factorForma} onChange={(e) => set("factorForma", e.target.value)} placeholder="0.65" className={cls} /></Field>
            <Field label="Volumen estimado (m³)"><input disabled value={auto > 0 ? auto.toFixed(4) : ""} placeholder="se calcula solo" className={`${cls} opacity-70`} /></Field>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">El volumen sale de DAP² × π/4 × altura comercial × factor de forma. Si el árbol está por debajo del DMC de su especie, el libro va a bloquear su tala.</p>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" disabled={busy || !f.treeCode.trim() || !f.speciesCommon.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar al censo
            </button>
          </div>
        </form>
      </AdminModal>
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
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none">
            <option value="todas">Toda categoría POA</option>
            <option value="aprovechable">Aprovechables</option>
            <option value="semillero">Semilleros</option>
            <option value="bajo_dmc">Bajo DMC</option>
            <option value="sin_dap">Sin DAP</option>
          </select>
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">
            {/* Tres números distintos y los tres importan: lo que se ve, lo que
                pasa el filtro y lo que hay. Con uno solo, 200 filas de 3.000
                parecen el censo entero. */}
            {Math.min(visibles, filtered.length)} de {filtered.length}
            {filtered.length !== total && <> · {total.toLocaleString("es-PE")} en el censo</>}
          </span>
        </div>
      )}
      <Table head={["Código", "Especie", "DAP", "Hc", "Vol. est. m³", "Categoría POA", "Estado", ""]}>
        {filtered.slice(0, visibles).map((t) => {
          const fuera = outOfPlan(t.speciesCommon);
          return (
          <tr key={t.id} className={`border-t border-[var(--rule-soft)] ${fuera ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12" : ""}`}>
            <Cell><Mono bold>{t.treeCode}</Mono></Cell>
            <Cell><span className="text-[var(--text-primary)]">{t.speciesCommon}</span>{t.cites && <CitesPill />}{fuera && <span className="ml-1.5 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">NO EN PLAN</span>}</Cell>
            <Cell right><Mono>{n(t.dapM, 2)}</Mono></Cell>
            <Cell right><Mono>{n(t.alturaComercialM, 2)}</Mono></Cell>
            <Cell right><Mono bold>{n(t.volumenEstimadoM3)}</Mono></Cell>
            <Cell><CategoriaTag categoria={categorias.get(t.id)} /></Cell>
            <Cell><EstadoTag estado={t.estado} /></Cell>
            <Cell right><button onClick={() => void del(t)} title={`Borrar ${t.treeCode}`} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button></Cell>
          </tr>
          );
        })}
        {trees.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-2 h-8 w-8 opacity-30" />Sin árboles censados. Agregá o importá el censo (CSV).</td></tr>}
        {trees.length > 0 && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">Ningún árbol coincide con el filtro.</td></tr>}
      </Table>
      {filtered.length > visibles && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVisibles((v) => v + 200)}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Ver 200 más ({(filtered.length - visibles).toLocaleString("es-PE")} restantes)
          </button>
          {truncado && (
            <p className="text-center text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Además hay {(total - trees.length).toLocaleString("es-PE")} árboles que no se cargaron: filtrá por estado para alcanzarlos.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Badge de la categoría POA — el filtro legal que decide si el árbol se tumba. */
function CategoriaTag({ categoria }: { categoria?: keyof typeof CATEGORIA_LABEL }) {
  if (!categoria) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold"
      style={{ backgroundColor: `${CATEGORIA_COLOR[categoria]}22`, color: CATEGORIA_COLOR[categoria] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORIA_COLOR[categoria] }} aria-hidden="true" />
      {CATEGORIA_LABEL[categoria]}
    </span>
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

function buildControlRows(species: Species[], trees: Tree[], balance: Balance | null): ControlRow[] {
  const spMap = new Map(species.map((s) => [claveEspecie(s.speciesCommon), s]));
  const balMap = new Map((balance?.rows ?? []).map((r) => [claveEspecie(r.species), r]));
  const groups = new Map<string, { name: string; count: number; vol: number; georref: number; talado: number; cites: boolean }>();
  for (const t of trees) {
    const key = claveEspecie(t.speciesCommon);
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
function QualityAlerts({ rows, onResolver }: { rows: ControlRow[]; onResolver?: (especie: string) => void }) {
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
        <div className="flex flex-wrap items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 px-4 py-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-bold">Especie(s) censada(s) fuera del plan aprobado: </span>
            {noAut.map((r) => r.species).join(", ")}.{" "}
            <span className="font-medium">Talar o movilizar una especie no autorizada es infracción — corregí el plan o el censo antes de emitir GTF.</span>
            {/* El aviso trae el camino: antes decía qué estaba mal y había que
                salir a buscar dónde se arregla. */}
            <span className="mt-2 flex flex-wrap gap-1.5">
              {noAut.map((r) => (
                <button
                  key={r.species}
                  type="button"
                  onClick={() => onResolver?.(r.species)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--data-error-700)] px-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                >
                  Resolver {r.species}
                </button>
              ))}
            </span>
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
  const fuera = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(claveEspecie(name));
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
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-bold text-[var(--text-primary)] ${i >= 2 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </DataTable>
    </div>
  );
}
function Cell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 ${right ? "text-right" : ""}`}>{children}</td>;
}
function Mono({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{children}</span>;
}
function AddBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white hover:opacity-90"><Plus className="h-3.5 w-3.5" />Agregar</button>;
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
