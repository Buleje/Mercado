"use client";

/**
 * useLothRentabilidad — los datos de «Rentabilidad y rendimiento» del Libro TH.
 *
 *   · Un solo pedido, `GET /api/admin/forestal/plan?analytics=1`, del que salen
 *     el margen, el flujo bosque→producto, el rendimiento y las anomalías.
 *   · Con más de un plan en el negocio se pide POR PLAN (`&planId=`): el servidor
 *     sólo cruza con los precios de ese plan lo que se movilizó bajo ese plan.
 *     Sin esto, el movilizado de todos los permisos se valorizaba con los
 *     precios de uno solo. Con un plan (o ninguno) no cambia nada.
 *   · El plan elegido se recuerda en este navegador; uno que ya no existe cae
 *     al vigente más reciente.
 *   · Sólo aplica el ÚLTIMO pedido: cambiar de plan dos veces seguidas no deja
 *     la respuesta vieja pisando a la nueva.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { csrfHeaders } from "@/lib/csrf-client";
import { construirFlujo, rankingRentabilidad, veredictoLibro } from "@/lib/forestal/loth-analitica";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { Analytics, FilaRendimiento, PlanOpcion } from "../loth-rentabilidad-datos";

const URL_PLAN = "/api/admin/forestal/plan";

async function mensajeDeError(r: Response): Promise<string> {
  const d = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  return d.message ?? d.error ?? `HTTP ${r.status}`;
}

export interface CostosForm {
  extraccionM3: string;
  transformacionM3: string;
  fleteM3: string;
}

export function useLothRentabilidad(reloadSignal?: number) {
  const [planes, setPlanes] = useState<PlanOpcion[] | null>(null);
  const [elegido, setElegido] = useLocalStorage<string | null>("loth:rentabilidad:plan", null);
  const [leido, setLeido] = useState<{ deplan: string | undefined; analytics: Analytics } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costos, setCostos] = useState<CostosForm>({ extraccionM3: "", transformacionM3: "", fleteM3: "" });
  const [guardando, setGuardando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef(0);

  // 1 · los planes del negocio (para el selector y para saber si hay que pedir por plan)
  useEffect(() => {
    let vivo = true;
    fetch(URL_PLAN, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((j: { plans?: PlanOpcion[] }) => {
        if (vivo) setPlanes((j.plans ?? []).map((p) => ({ id: p.id, planNumber: p.planNumber ?? null, titularName: p.titularName, estado: p.estado })));
      })
      .catch(() => {
        if (vivo) setPlanes([]);
      });
    return () => {
      vivo = false;
    };
  }, [reloadSignal, recarga]);

  /** `undefined` = un solo plan (o ninguno): el pedido de siempre. */
  const planId = useMemo(() => {
    if (!planes || planes.length < 2) return undefined;
    if (elegido && planes.some((p) => p.id === elegido)) return elegido;
    return (planes.find((p) => p.estado === "vigente") ?? planes[0]).id;
  }, [planes, elegido]);

  // 2 · la analítica de ese plan
  useEffect(() => {
    if (planes === null) return;
    const mio = ++pedido.current;
    setCargando(true);
    setError(null);
    const url = `${URL_PLAN}?analytics=1${planId ? `&planId=${encodeURIComponent(planId)}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await mensajeDeError(r));
        return ((await r.json()) as { analytics: Analytics }).analytics;
      })
      .then((a) => {
        if (mio !== pedido.current) return;
        setLeido({ deplan: planId, analytics: a });
        const c = a.plan?.costos;
        setCostos({
          extraccionM3: c?.extraccionM3 ? String(c.extraccionM3) : "",
          transformacionM3: c?.transformacionM3 ? String(c.transformacionM3) : "",
          fleteM3: c?.fleteM3 ? String(c.fleteM3) : "",
        });
      })
      .catch((e: unknown) => {
        if (mio !== pedido.current) return;
        // Otro plan que falla no deja las cifras del anterior bajo el selector nuevo.
        setLeido((l) => (l?.deplan === planId ? l : null));
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (mio === pedido.current) setCargando(false);
      });
  }, [planes, planId]);

  /** Sólo lo leído PARA el plan del selector: nunca las cifras de otro. */
  const data = leido && leido.deplan === planId ? leido.analytics : null;

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  const guardarCostos = useCallback(async (): Promise<boolean> => {
    const idPlan = planId ?? data?.plan?.id;
    if (!idPlan) return false;
    setGuardando(true);
    setError(null);
    try {
      const num = (v: string) => (v ? Number(v) : null);
      const r = await fetch(URL_PLAN, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          id: idPlan,
          costoExtraccionM3: num(costos.extraccionM3),
          costoTransformacionM3: num(costos.transformacionM3),
          costoFleteM3: num(costos.fleteM3),
        }),
      });
      if (!r.ok) throw new Error(await mensajeDeError(r));
      recargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }, [planId, data, costos, recargar]);

  const flujo = useMemo(() => (data ? construirFlujo(data.aprovechamiento.funnel) : null), [data]);
  const ranking = useMemo(() => (data?.costeo ? rankingRentabilidad(data.costeo.rows) : []), [data]);
  const veredicto = useMemo(() => {
    if (!data) return null;
    return veredictoLibro({
      errores: data.anomalias.filter((a) => a.level === "error").length,
      alertas: data.anomalias.filter((a) => a.level === "warn").length,
      especiesFueraDePlan: (data.especiesNoAutorizadas ?? []).length,
      saldoNegativo: (data.balance?.rows ?? []).some((r) => r.saldo < 0),
      // Los días para agotar el saldo viven en Extracción (aviso `agota_pronto`), por permiso.
      margenPctTotal: data.costeo?.margenPctTotal ?? null,
    });
  }, [data]);

  /**
   * Rendimiento y valor por especie: lo que Extracción no muestra. El plan
   * escribe «Tornillo (Cedrelinga catenaeformis)» y el libro sólo «Tornillo»:
   * se cruzan por `claveEspecie` (mismo criterio que `computeBalance`) para que
   * sea UNA fila por especie.
   */
  const porEspecie = useMemo<FilaRendimiento[]>(() => {
    if (!data) return [];
    const saldo = new Map((data.balance?.rows ?? []).map((r) => [claveEspecie(r.species), r]));
    const aprov = new Map(data.aprovechamiento.bySpecies.map((s) => [claveEspecie(s.species), s]));
    const claves = new Set<string>([...saldo.keys(), ...aprov.keys()]);
    return [...claves]
      .map((clave) => {
        const ap = aprov.get(clave);
        const ba = saldo.get(clave);
        return {
          species: ba?.species ?? ap?.species ?? clave,
          cites: ap?.cites ?? false,
          taladoM3: ap?.taladoM3 ?? 0,
          rendimientoPct: ap?.rendimientoPct ?? null,
          mermaM3: ap?.mermaM3 ?? 0,
          valorMovilizado: ba?.valorMovilizado ?? 0,
        };
      })
      .filter((s) => s.taladoM3 > 0 || s.valorMovilizado > 0)
      .sort((a, b) => b.valorMovilizado - a.valorMovilizado || b.taladoM3 - a.taladoM3);
  }, [data]);

  return {
    planes: planes ?? [],
    planId,
    elegirPlan: setElegido,
    data,
    cargando,
    error,
    recargar,
    costos,
    setCostos,
    guardando,
    guardarCostos,
    flujo,
    ranking,
    veredicto,
    porEspecie,
  };
}
