"use client";

/**
 * useLothMapaDatos — lo que el mapa del Libro TH lee y guarda en el servidor.
 *
 * Operaciones del libro, polígono del área, plan activo, carátula y
 * cartografía (predio, referencias, vías, accesos); y, colgando del plan, el
 * censo, las especies autorizadas y el POA. Desde el 02-10-2026 el plan y las
 * líneas son los del permiso elegido en el chip del libro (si hay uno); el
 * polígono, las referencias y las vías siguen siendo POR NEGOCIO. Salió de `LothMapaView` cuando la
 * vista pasó las mil líneas: la pantalla ordena, esto trae y guarda.
 *
 * `cartoSinGuardar`: una vía trazada, una referencia marcada o el contorno
 * copiado del área viven en memoria hasta que alguien toca «Guardar». Con los
 * bloques de datos plegados ese botón puede no verse, así que la vista tiene
 * que saber si hay algo pendiente para decirlo junto al mapa.
 *
 * `leido`: el PUT de la cartografía y el de la parcela REEMPLAZAN el documento
 * entero. Si la lectura falló (un 429 al recargar seguido, un 500), la pantalla
 * queda con listas vacías y el primer «Guardar» —o marcar «deforestación
 * cero», que manda los vértices que haya en memoria— borraba lo guardado sin un
 * solo aviso (visto en la prueba del 2026-09-18: tras un 429 el bloque decía
 * «0 referencias» con dos guardadas). Sin lectura buena, no se escribe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { emptyParcela, normalizeParcela, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { emptyCartografia, normalizeCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { defaultPoaConfig, type PoaConfig } from "@/lib/forestal/loth-poa";
import { cumplePermiso, queryDelPermiso, type FiltroPermiso } from "@/lib/forestal/loth-filtro-permiso";
import type { CensusTreeDTO } from "../loth-mapa-shared";

export interface PlanActivoMapa {
  id: string;
  areaHa: number | null;
  parcelaCorta: string | null;
  titularName: string | null;
  planNumber: string | null;
  tituloHabilitante: string | null;
  resolucionNumber: string | null;
  arffs: string | null;
  region: string | null;
}

export interface CaratulaMapa {
  id: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  titularName: string | null;
  tituloHabilitante: string | null;
}

export interface EspeciePlanMapa {
  speciesCommon: string;
  volumenAutorizadoM3: string | number;
  arbolesAutorizados: number | null;
}

type Json = Record<string, unknown> & { message?: string };

/**
 * Lo que devuelve guardar la cartografía. `conflicto` = otro guardó el plano
 * desde que se leyó (409): ya se recargó lo último, que viene acá para que
 * quien guarda decida (el planificador vuelve a mezclar sobre eso).
 */
export type ResultadoGuardarCarto = { ok: true; cartografia: LothCartografia } | { ok: false; conflicto: LothCartografia | null };

/** Lo que ve quien tocó «Guardar» cuando otro guardó antes. */
export const MENSAJE_PLANO_CAMBIO = "Alguien cambió el plano: recargué lo último, revisa y vuelve a guardar.";

/** El mensaje del servidor si lo manda; si no, el status. */
async function mensajeDeError(r: Response): Promise<string> {
  const cuerpo = await leerJson<Json>(r);
  return typeof cuerpo?.message === "string" && cuerpo.message ? cuerpo.message : `HTTP ${r.status}`;
}

const txt = (v: unknown): string | null => (typeof v === "string" ? v : null);

function planDesdeFila(a: Json): PlanActivoMapa {
  return {
    id: String(a.id),
    areaHa: a.areaHa != null ? Number(a.areaHa) : null,
    parcelaCorta: txt(a.parcelaCorta),
    titularName: txt(a.titularName),
    planNumber: txt(a.planNumber),
    tituloHabilitante: txt(a.tituloHabilitante),
    resolucionNumber: txt(a.resolucionNumber),
    arffs: txt(a.arffs),
    region: txt(a.region),
  };
}

/** Qué partes del NEGOCIO ya se leyeron bien (no se vuelven a pedir). */
interface PartesNegocio {
  parcela: boolean;
  carto: boolean;
  caratula: boolean;
}

/**
 * Lo que es del NEGOCIO y no del plan: polígono del área, carátula y
 * cartografía. Sólo se piden las partes que faltan; `undefined` = no se pidió,
 * `null` = se pidió y no se pudo leer.
 */
async function leerNegocio(faltan: PartesNegocio): Promise<{
  parcela?: LothParcela | null;
  carto?: LothCartografia | null;
  caratula?: { valor: CaratulaMapa | null } | null;
  errorLectura: string | null;
}> {
  const [pRes, cRes, gRes] = await Promise.all([
    faltan.parcela ? fetch("/api/admin/forestal/loth/parcela", { credentials: "include" }) : null,
    faltan.caratula ? fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }) : null,
    faltan.carto ? fetch("/api/admin/forestal/loth/cartografia", { credentials: "include" }) : null,
  ]);
  const parcela = pRes ? (pRes.ok ? normalizeParcela((await pRes.json()).parcela) : null) : undefined;
  const carto = gRes ? (gRes.ok ? normalizeCartografia((await gRes.json()).cartografia) : null) : undefined;
  let errorLectura: string | null = null;
  if ((pRes && !pRes.ok) || (gRes && !gRes.ok)) {
    const que = [pRes && !pRes.ok && `el polígono (${await mensajeDeError(pRes)})`, gRes && !gRes.ok && `la cartografía (${await mensajeDeError(gRes)})`]
      .filter(Boolean)
      .join(" ni ");
    errorLectura = `No se pudo leer ${que}. Recarga la página antes de guardar: guardar ahora borraría lo que ya está.`;
  }
  let caratula: { valor: CaratulaMapa | null } | null | undefined;
  if (cRes) {
    const a = cRes.ok ? (((await cRes.json()).active ?? null) as Json | null) : undefined;
    caratula =
      a === undefined
        ? null
        : {
            valor: a
              ? {
                  id: txt(a.id),
                  departamento: txt(a.departamento),
                  provincia: txt(a.provincia),
                  distrito: txt(a.distrito),
                  titularName: txt(a.titularName),
                  tituloHabilitante: txt(a.tituloHabilitante),
                }
              : null,
          };
  }
  return { parcela, carto, caratula, errorLectura };
}

/**
 * Con qué permiso mira el mapa (el chip del libro, 02-10-2026). `planId` = el
 * plan elegido (no «sin plan»): de él salen censo, especies y POA; `null` = el
 * plan activo, como antes. `filtro` = qué líneas del libro se pintan.
 */
export interface PermisoDelMapa {
  planId?: string | null;
  filtro?: FiltroPermiso | null;
}

export function useLothMapaDatos({ planId: planElegido = null, filtro = null }: PermisoDelMapa = {}) {
  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [trees, setTrees] = useState<CensusTreeDTO[]>([]);
  /** Especies autorizadas + parámetros del POA: pintan el censo por categoría. */
  const [planSpecies, setPlanSpecies] = useState<EspeciePlanMapa[]>([]);
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  const [parcela, setParcela] = useState<LothParcela>(emptyParcela());
  const [plan, setPlan] = useState<PlanActivoMapa | null>(null);
  const [caratula, setCaratula] = useState<CaratulaMapa | null>(null);
  const [carto, setCarto] = useState<LothCartografia>(emptyCartografia());
  /** La última cartografía que el servidor confirmó: contra ella se mide lo pendiente. */
  const [cartoGuardada, setCartoGuardada] = useState<LothCartografia>(emptyCartografia());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCarto, setSavingCarto] = useState(false);
  /** Cambia cuando termina una carga: el canvas re-encuadra. */
  const [fitKey, setFitKey] = useState(0);
  /** Qué se leyó bien del servidor: sin eso, guardar pisaría lo que hay. */
  const [leido, setLeido] = useState({ parcela: false, carto: false });

  /** Los datos POR NEGOCIO ya leídos bien: cambiar de permiso no los relee (ni pisa lo que está sin guardar). */
  const negocioLeido = useRef<PartesNegocio>({ parcela: false, carto: false, caratula: false });
  /** Sólo vale la ÚLTIMA carga: cambiar de permiso rápido no deja la vieja pisando a la nueva. */
  const ultimaCarga = useRef(0);

  /*
   * Una carga por permiso. Lo del PLAN (líneas del libro, censo, especies,
   * POA) se pide cada vez; lo del NEGOCIO, sólo hasta leerlo bien una vez: la
   * cartografía vive en memoria hasta «Guardar», y releerla al cambiar de
   * permiso borraría una vía trazada sin guardar.
   */
  useEffect(() => {
    const carga = ++ultimaCarga.current;
    const vigente = () => carga === ultimaCarga.current;
    const ya = negocioLeido.current;
    const faltan: PartesNegocio = { parcela: !ya.parcela, carto: !ya.carto, caratula: !ya.caratula };
    const conNegocio = faltan.parcela || faltan.carto || faltan.caratula;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const q = queryDelPermiso(filtro);
        const [eRes, plRes, negocio] = await Promise.all([
          fetch(`/api/admin/forestal/loth?limit=500&includeAnnulled=1${q ? `&${q}` : ""}`, { credentials: "include" }),
          planElegido
            ? fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planElegido)}`, { credentials: "include" })
            : fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
          conNegocio ? leerNegocio(faltan) : Promise.resolve(null),
        ]);
        if (!vigente()) return;
        if (negocio) {
          const { parcela: p, carto: c, caratula: ca } = negocio;
          if (p) setParcela(p);
          if (c) {
            setCarto(c);
            setCartoGuardada(c);
          }
          if (ca) setCaratula(ca.valor);
          negocioLeido.current = { parcela: ya.parcela || p != null, carto: ya.carto || c != null, caratula: ya.caratula || ca != null };
          setLeido({ parcela: negocioLeido.current.parcela, carto: negocioLeido.current.carto });
        }
        if (!eRes.ok) throw new Error(await mensajeDeError(eRes));
        /* El server ya filtra por `planId`; `cumplePermiso` es la misma regla
           del lado de la pantalla, por si la ruta devuelve de más. */
        const entradas = ((await eRes.json()).entries ?? []) as LothEntryDTO[];
        setRaw(filtro ? entradas.filter((e) => cumplePermiso(e.planId, filtro)) : entradas);
        if (negocio?.errorLectura) setError(negocio.errorLectura);

        /* El plan del mapa: el elegido en el libro; si no hay, el activo (como antes). */
        const pj = plRes.ok ? await leerJson<{ plan?: Json | null; active?: Json | null; species?: EspeciePlanMapa[] }>(plRes) : null;
        const a = (planElegido ? pj?.plan : pj?.active) ?? null;
        if (!vigente()) return;
        setPlan(a ? planDesdeFila(a) : null);
        if (!a?.id) {
          /* Sin plan no hay censo: vaciarlo, o quedaría pintado el del permiso anterior. */
          setTrees([]);
          setPlanSpecies([]);
          setPoaConfig(defaultPoaConfig());
          return;
        }
        // El censo y el POA cuelgan del plan: se piden en cascada (no bloquean el primer render del mapa).
        const pid = encodeURIComponent(String(a.id));
        const [tRes, sRes, poaRes] = await Promise.all([
          fetch(`/api/admin/forestal/plan/census?planId=${pid}`, { credentials: "include" }),
          planElegido ? Promise.resolve(null) : fetch(`/api/admin/forestal/plan?planId=${pid}`, { credentials: "include" }),
          fetch(`/api/admin/forestal/loth/poa?planId=${pid}`, { credentials: "include" }),
        ]);
        if (!vigente()) return;
        setTrees(tRes.ok ? ((await tRes.json()).trees ?? []) : []);
        const especies = planElegido ? pj?.species : sRes?.ok ? (await sRes.json()).species : null;
        setPlanSpecies(especies ?? []);
        // Sin POA guardado —o si su lectura falla— el defecto es el del PLAN (ADR-455):
        // una plantación no reserva semilleros (0 %), el bosque natural el 10 %. Antes
        // un GET fallido dejaba el 10 % aunque el plan fuera una plantación.
        const porDefecto = defaultPoaConfig({ planType: txt(a.planType), planNumber: txt(a.planNumber), tituloHabilitante: txt(a.tituloHabilitante) });
        const poa = poaRes.ok ? await leerJson<{ config?: PoaConfig | null }>(poaRes) : null;
        if (vigente()) setPoaConfig(poa?.config ?? porDefecto);
      } catch (err) {
        if (vigente()) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (vigente()) {
          setFitKey((k) => k + 1);
          setLoading(false);
        }
      }
    })();
  }, [planElegido, filtro]);

  const persistParcela = useCallback(
    async (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => {
      if (!leido.parcela) {
        setError("El polígono no se pudo leer del servidor: recarga la página antes de guardarlo.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/parcela", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(next),
        });
        if (!r.ok) throw new Error(await mensajeDeError(r));
        setParcela(normalizeParcela((await r.json()).parcela));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [leido.parcela],
  );

  /**
   * `siguiente` permite guardar un estado recién armado sin esperar al
   * re-render (lo usa el guardado del dibujo del predio).
   *
   * El cuerpo se arma con TODOS los campos y no con una lista escrita a mano:
   * cuando era `{referencias, vias, accesos, nota}` el predio se perdía en cada
   * guardado —el PUT reemplaza el documento entero— y sin un solo error.
   */
  /**
   * Guarda contra la versión leída (`baseUpdatedAt`): si otro guardó en el
   * medio, el servidor responde 409 con lo último, se recarga y —salvo
   * `avisarConflicto: false`— se avisa. `base` fuerza la versión (el
   * planificador reintenta sobre la que le devolvió el 409, antes del re-render).
   */
  const guardarCartografia = useCallback(
    async (siguiente?: LothCartografia, opts: { base?: string | null; avisarConflicto?: boolean } = {}): Promise<ResultadoGuardarCarto> => {
      const cuerpo = siguiente ?? carto;
      if (!leido.carto) {
        setError("La cartografía no se pudo leer del servidor: recarga la página antes de guardar referencias, vías o el predio.");
        return { ok: false, conflicto: null };
      }
      setSavingCarto(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/cartografia", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            referencias: cuerpo.referencias,
            vias: cuerpo.vias,
            accesos: cuerpo.accesos,
            predio: cuerpo.predio,
            nota: cuerpo.nota,
            baseUpdatedAt: opts.base !== undefined ? opts.base : cartoGuardada.updatedAt,
          }),
        });
        if (r.status === 409) {
          const actual = await leerJson<{ cartografia?: unknown }>(r);
          const c = normalizeCartografia(actual?.cartografia);
          setCarto(c);
          setCartoGuardada(c);
          if (opts.avisarConflicto !== false) setError(MENSAJE_PLANO_CAMBIO);
          return { ok: false, conflicto: c };
        }
        if (!r.ok) throw new Error(await mensajeDeError(r));
        const c = normalizeCartografia((await r.json()).cartografia);
        setCarto(c);
        setCartoGuardada(c);
        return { ok: true, cartografia: c };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return { ok: false, conflicto: null };
      } finally {
        setSavingCarto(false);
      }
    },
    [carto, cartoGuardada.updatedAt, leido.carto],
  );

  const cartoSinGuardar = useMemo(() => JSON.stringify(carto) !== JSON.stringify(cartoGuardada), [carto, cartoGuardada]);

  return {
    raw,
    trees,
    planSpecies,
    poaConfig,
    parcela,
    plan,
    caratula,
    setCaratula,
    carto,
    setCarto,
    cartoSinGuardar,
    loading,
    error,
    setError,
    saving,
    savingCarto,
    fitKey,
    persistParcela,
    guardarCartografia,
  };
}

export type LothMapaDatos = ReturnType<typeof useLothMapaDatos>;
