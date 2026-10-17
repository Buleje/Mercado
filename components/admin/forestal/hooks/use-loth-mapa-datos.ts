"use client";

/**
 * useLothMapaDatos — lo que el mapa del Libro TH lee y guarda en el servidor.
 *
 * Operaciones del libro, plan, carátula y, colgando del plan, el censo, las
 * especies autorizadas y el POA. El plan y las líneas son los del permiso
 * elegido en la banda del libro (02-10-2026). El área y la cartografía
 * (predio, referencias, vías, accesos) son POR PERMISO desde el ADR-462 y viven
 * en `use-loth-mapa-geo`; acá se juntan para que la vista reciba un solo
 * objeto. Salió de `LothMapaView` cuando la vista pasó las mil líneas: la
 * pantalla ordena, esto trae y guarda.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { defaultPoaConfig, type PoaConfig } from "@/lib/forestal/loth-poa";
import { cumplePermiso, queryDelPermiso, type FiltroPermiso } from "@/lib/forestal/loth-filtro-permiso";
import type { CensusTreeDTO } from "../loth-mapa-shared";
import type { AlcanceMapa } from "../loth-mapa-alcance";
import { mensajeDeError, useLothMapaGeo } from "./use-loth-mapa-geo";

export { MENSAJE_PLANO_CAMBIO, type ResultadoGuardarCarto } from "./use-loth-mapa-geo";

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

/** La carátula es del NEGOCIO: se lee una vez y no se relee al cambiar de permiso. */
async function leerCaratula(): Promise<CaratulaMapa | null | undefined> {
  const r = await fetch("/api/admin/forestal/loth/caratula", { credentials: "include" });
  if (!r.ok) return undefined;
  const a = ((await r.json()).active ?? null) as Json | null;
  return a
    ? {
        id: txt(a.id),
        departamento: txt(a.departamento),
        provincia: txt(a.provincia),
        distrito: txt(a.distrito),
        titularName: txt(a.titularName),
        tituloHabilitante: txt(a.tituloHabilitante),
      }
    : null;
}

/**
 * Con qué permiso mira el mapa (el chip del libro, 02-10-2026). `planId` = el
 * plan elegido (no «sin plan»): de él salen censo, especies y POA; `null` = el
 * plan activo, como antes. `filtro` = qué líneas del libro se pintan.
 * `alcance` = de qué permiso son el área y la cartografía (ADR-462).
 */
export interface PermisoDelMapa {
  planId?: string | null;
  filtro?: FiltroPermiso | null;
  alcance?: AlcanceMapa;
}

const DEL_NEGOCIO: AlcanceMapa = { tipo: "negocio" };

export function useLothMapaDatos({ planId: planElegido = null, filtro = null, alcance = DEL_NEGOCIO }: PermisoDelMapa = {}) {
  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [trees, setTrees] = useState<CensusTreeDTO[]>([]);
  /** Especies autorizadas + parámetros del POA: pintan el censo por categoría. */
  const [planSpecies, setPlanSpecies] = useState<EspeciePlanMapa[]>([]);
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  const [plan, setPlan] = useState<PlanActivoMapa | null>(null);
  const [caratula, setCaratula] = useState<CaratulaMapa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const geo = useLothMapaGeo(alcance, setError);
  /**
   * Cambia cuando terminan la carga del libro Y la del área (llegan por
   * separado): el canvas re-encuadra y las etapas y rutas se releen UNA vez.
   */
  const [fitKey, setFitKey] = useState(0);
  const todoListo = !loading && geo.geoListo;
  useEffect(() => {
    if (todoListo) setFitKey((k) => k + 1);
  }, [todoListo]);

  /** La carátula ya leída bien: cambiar de permiso no la relee. */
  const caratulaLeida = useRef(false);
  /** Sólo vale la ÚLTIMA carga: cambiar de permiso rápido no deja la vieja pisando a la nueva. */
  const ultimaCarga = useRef(0);

  /* Una carga por permiso: líneas del libro, plan, censo, especies y POA. */
  useEffect(() => {
    const carga = ++ultimaCarga.current;
    const vigente = () => carga === ultimaCarga.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const q = queryDelPermiso(filtro);
        const [eRes, plRes, ca] = await Promise.all([
          fetch(`/api/admin/forestal/loth?limit=500&includeAnnulled=1${q ? `&${q}` : ""}`, { credentials: "include" }),
          planElegido
            ? fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planElegido)}`, { credentials: "include" })
            : fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
          caratulaLeida.current ? Promise.resolve(undefined) : leerCaratula(),
        ]);
        if (!vigente()) return;
        if (ca !== undefined) {
          setCaratula(ca);
          caratulaLeida.current = true;
        }
        if (!eRes.ok) throw new Error(await mensajeDeError(eRes));
        /* El server ya filtra por `planId`; `cumplePermiso` es la misma regla
           del lado de la pantalla, por si la ruta devuelve de más. */
        const entradas = ((await eRes.json()).entries ?? []) as LothEntryDTO[];
        setRaw(filtro ? entradas.filter((e) => cumplePermiso(e.planId, filtro)) : entradas);

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
        if (vigente()) setLoading(false);
      }
    })();
  }, [planElegido, filtro]);

  /**
   * Un árbol del censo que se acaba de corregir en el servidor (p. ej. se le
   * cargaron las coordenadas): entra al mapa sin recargar todo ni re-encuadrar.
   */
  const reemplazarArbol = useCallback((arbol: CensusTreeDTO) => {
    setTrees((prev) => prev.map((t) => (t.id === arbol.id ? { ...t, ...arbol } : t)));
  }, []);

  return {
    raw,
    trees,
    planSpecies,
    poaConfig,
    plan,
    caratula,
    setCaratula,
    ...geo,
    loading: !todoListo,
    error,
    setError,
    fitKey,
    reemplazarArbol,
  };
}

export type LothMapaDatos = ReturnType<typeof useLothMapaDatos>;
