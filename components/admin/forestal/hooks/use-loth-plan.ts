"use client";

/**
 * Los datos de la vista Plan de manejo: los planes, el detalle del elegido
 * (especies, censo, balance, parámetros del POA) y todo lo que se deriva de
 * ellos —fichas por especie, POA, zafra, plan de tala—.
 *
 * Salió de `LothPlanView` tal cual: la vista queda para ordenar los bloques.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analizarPoa, defaultPoaConfig, type PlanParaPoa, type PoaAnalisis, type PoaConfig } from "@/lib/forestal/loth-poa";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { normalizarCondicion } from "@/lib/forestal/loth-mapa-arboles";
import { analizarZafra } from "@/lib/forestal/loth-zafra";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FichaEspecie } from "../LothEspecieFichas";
import {
  CENSO_LIMITE,
  FLAG_LABEL,
  buildControlRows,
  type Balance,
  type CensusStat,
  type Plan,
  type Species,
  type Tree,
} from "../loth-plan-shared";

/** Lo mínimo de `usoCenso` (`ForestLothDB.usoDelCenso`) que el POA necesita. */
interface UsoDelLibro {
  treeCode: string;
  tala: unknown;
}

export function useLothPlan(reloadSignal?: number) {
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
  /** Qué árboles ya taló el LIBRO (por código), aunque el censo diga «en pie». */
  const [usoCenso, setUsoCenso] = useState<UsoDelLibro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  /**
   * De qué plan es el detalle que hay en pantalla. Mientras no coincide con el
   * elegido, la vista dice que está cargando en vez de «0 m³ autorizados»:
   * medido, entre que llega la lista de planes y llega el detalle la cabecera
   * decía cero y el plan de tala desaparecía (saldo 0 ⇒ nada que talar).
   */
  const [detalleDe, setDetalleDe] = useState<string | null>(null);
  /** El último detalle pedido: la respuesta de un plan anterior no pisa la del actual. */
  const ultimoPedido = useRef(0);
  // Plan Operativo: DMC por especie + % de semilleros (KV por plan).
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  /** Lo último que devolvió el servidor: contra esto se sabe si hay cambios sin guardar. */
  const [poaGuardado, setPoaGuardado] = useState<PoaConfig>(defaultPoaConfig());
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
    const pedido = ++ultimoPedido.current;
    try {
      const [d, c, b, poa, u] = await Promise.all([
        fetch(`/api/admin/forestal/plan?planId=${id}`, { credentials: "include" }),
        /* El límite va EXPLÍCITO: el POA se calcula sobre estas filas, así que
           cuánto se trae es una decisión de esta pantalla y no un default que
           puede cambiar en el servidor sin que nadie se entere. */
        fetch(`/api/admin/forestal/plan/census?planId=${id}&limit=${CENSO_LIMITE}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/plan?balance=${id}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/loth/poa?planId=${id}`, { credentials: "include" }),
        /* Qué taló el LIBRO de verdad: el `estado` del censo se escribe
           fire-and-forget y puede quedar atrás (manda el libro, no el censo). */
        fetch(`/api/admin/forestal/loth?usoCenso=1`, { credentials: "include" }),
      ]);
      if (pedido !== ultimoPedido.current) return;
      let planDelDetalle: PlanParaPoa | null = null;
      if (d.ok) {
        const j = await d.json();
        planDelDetalle = (j.plan as PlanParaPoa | undefined) ?? null;
        setSpecies(j.species ?? []); setCensusStat(j.censusSummary ?? []);
      }
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
      /* Si el GET del POA falla, el respaldo es el defecto DEL PLAN (una
         plantación no vuelve a 10 %), no un 10 % fijo. */
      const cfg: PoaConfig = poa.ok
        ? ((await poa.json()).config ?? defaultPoaConfig(planDelDetalle))
        : defaultPoaConfig(planDelDetalle);
      setPoaConfig(cfg);
      setPoaGuardado(cfg);
      if (u.ok) setUsoCenso(((await u.json()).usos ?? []) as UsoDelLibro[]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    /* También si falló: el error ya está a la vista y la carga no queda
       girando para siempre. */
    finally { if (pedido === ultimoPedido.current) setDetalleDe(id); }
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

  /** Árboles que el libro ya taló (por id), aunque el censo diga «en pie». */
  const taladosEnLibro = useMemo(() => {
    const codigosTalados = new Set(usoCenso.filter((u) => u.tala).map((u) => u.treeCode));
    return new Set(trees.filter((t) => codigosTalados.has(t.treeCode)).map((t) => t.id));
  }, [usoCenso, trees]);

  /**
   * El POA cruza el censo con el DMC de cada especie: cuántos árboles se pueden
   * tumbar de verdad, cuántos quedan de semilleros y con qué intensidad.
   * `taladosEnLibro` manda sobre el `estado` del censo: un árbol que el libro
   * ya tumbó no puede competir por el lugar de semillero.
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
        taladosEnLibro,
        // Plantación: el 0 % es lo que corresponde (ADR-455), no un olvido que avisar.
        plan,
      }),
    [trees, species, plan, poaConfig, taladosEnLibro],
  );
  /** Categoría POA por árbol — la muestra el censo como badge. */
  const categoriaPorArbol = useMemo(() => new Map(poa.arboles.map((a) => [a.id, a.categoria])), [poa.arboles]);
  /**
   * Cuántos semilleros declaró el REGENTE en la hoja del censo (columna
   * `condicion`), para compararlo con los que reserva el sistema
   * (`poa.totales.semilleros`). Sobre árboles en pie: uno ya talado no cuenta,
   * declarado o no — es del pasado, no de la próxima tala.
   */
  const semillerosDeclarados = useMemo(
    () =>
      trees.filter((t) => t.estado === "en_pie" && !taladosEnLibro.has(t.id) && normalizarCondicion((t as { condicion?: string | null }).condicion) === "semillero").length,
    [trees, taladosEnLibro],
  );

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
      const guardada: PoaConfig = (await r.json()).config ?? poaConfig;
      setPoaConfig(guardada);
      setPoaGuardado(guardada);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoaSaving(false);
    }
  }, [planId, poaConfig]);

  /* «Guardar» sólo aparece cuando hay algo que guardar: siempre a la vista era
     un botón más en una cabecera que ya tenía tres. */
  const poaSucio = !mismaConfigPoa(poaConfig, poaGuardado);

  /** El detalle en pantalla es el del plan elegido (no el anterior ni ninguno). */
  const detalleListo = planId != null && detalleDe === planId;

  return {
    poaSucio,
    detalleListo,
    plans, planId, setPlanId, plan, species, trees, censoTotal, censoTruncado, censusStat,
    especieFuera, setEspecieFuera, loading, error, showPlanForm, setShowPlanForm, balance,
    poaConfig, setPoaConfig, poaSaving, savePoaConfig, loadPlans, loadDetail,
    autorizadoTotal, controlRows, fichasEspecie, movilizadoTotal, aprovechamientoPct, saldoTotal,
    georrefPct, noAutorizadas, okCount, authorizedSet, poa, categoriaPorArbol, semillerosDeclarados,
    arbolesParaTalar, saldosPorEspecie, zafra,
  };
}

/** Dos configuraciones del POA son la misma aunque las claves vengan en otro orden. */
function mismaConfigPoa(a: PoaConfig, b: PoaConfig): boolean {
  if (a.semillerosPct !== b.semillerosPct) return false;
  const ka = Object.keys(a.dmcOverrides);
  if (ka.length !== Object.keys(b.dmcOverrides).length) return false;
  return ka.every((k) => a.dmcOverrides[k] === b.dmcOverrides[k]);
}
