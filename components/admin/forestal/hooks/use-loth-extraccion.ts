"use client";

/**
 * useLothExtraccion — los datos de la vista «Extracción» del Libro TH (ADR-454).
 *
 *   · Un GET a `/api/admin/forestal/loth/extraccion` con el permiso y el
 *     período elegidos; el período anterior (para el ritmo) lo calcula la
 *     pantalla con `periodoAnterior`, como pide el contrato.
 *   · Sólo aplica el ÚLTIMO pedido: cambiar de permiso dos veces seguidas no
 *     deja la respuesta vieja pisando a la nueva.
 *   · Permiso y período se recuerdan en este navegador. Un permiso recordado
 *     que ya no existe (404) vuelve a «Todos» en vez de dejar la vista en error.
 *   · La lista de planes para el selector sale de `/api/admin/forestal/plan`:
 *     con un permiso elegido, la respuesta trae sólo ese y el selector no
 *     podría ofrecer los demás.
 *   · «Sin plan» (`planId=sin-plan`) se ofrece si la vista «Todos» trajo
 *     líneas sin árbol en ningún censo.
 *   · La especie filtra la tabla y los gráficos en pantalla (no pide de nuevo);
 *     si el alcance nuevo no la tiene, se suelta sola.
 *   · Unir un plan con su permiso (`loth-plan-unir`) avisa por evento de
 *     ventana y la vista vuelve a leer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useLothPermiso } from "./use-loth-libro-permiso";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { resolveCtpPeriod, type CtpPeriod, type CtpPeriodKey } from "@/lib/forestal/ctp-period";
import type { ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import type { CtpCustomRange } from "../CtpPeriodPicker";
import { leerExtraccion, paramsDeExtraccion } from "../loth-extraccion-shared";
import { alCambiarPlanPermiso } from "../loth-plan-unir";

export interface OpcionPlan {
  id: string;
  etiqueta: string;
  detalle: string | null;
}

/** El `planId` que la ruta entiende como «las líneas sin plan ni árbol en un censo». */
export const PLAN_SIN_PLAN = "sin-plan";

export interface EstadoExtraccion {
  datos: ExtraccionResponse | null;
  cargando: boolean;
  error: string | null;
  reintentar: () => void;
  planes: OpcionPlan[];
  /** La última lectura de «Todos» trajo la fila «Sin plan». */
  haySinPlan: boolean;
  planId: string | null;
  elegirPlan: (id: string | null) => void;
  periodKey: CtpPeriodKey;
  custom: CtpCustomRange;
  period: CtpPeriod;
  elegirPeriodo: (key: CtpPeriodKey) => void;
  elegirRango: (r: CtpCustomRange) => void;
  /** La especie elegida, ya validada contra el alcance que se está mirando. */
  especie: string | null;
  elegirEspecie: (clave: string | null) => void;
}

const RANGO_VACIO: CtpCustomRange = { from: "", to: "" };

function mensajeDeEstado(status: number): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 403) return "El Libro TH no está habilitado para tu usuario o tu negocio.";
  if (status === 404) return "Esta lectura todavía no está disponible en el servidor.";
  if (status === 429) return "Demasiadas consultas seguidas. Espera un momento y reintenta.";
  return `No se pudo leer la extracción (error ${status}).`;
}

interface PlanCrudo {
  id?: unknown;
  planNumber?: unknown;
  alias?: unknown;
  titularName?: unknown;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function useLothExtraccion(reloadSignal = 0): EstadoExtraccion {
  const [planLocal, setPlanLocal] = useLocalStorage<string | null>("loth-extraccion:plan", null);
  /* El permiso del libro (02-10): con uno elegido arriba (un plan o «Sin plan») esta vista mira ése; con «Todos» conserva lo suyo, sin escribir el global. */
  const permiso = useLothPermiso();
  const planGlobal = permiso?.planSel ?? null;
  const permisoListo = permiso?.listo ?? true;
  /* Un plan que el servidor ya no tiene (404): ESTA vista muestra «Todos»; el global no se toca (el aviso «se dio de baja» es del chip). */
  const [planCaido, setPlanCaido] = useState<string | null>(null);
  const planPedido = planGlobal ?? planLocal;
  const planId = planPedido && planPedido === planCaido ? null : planPedido;
  const elegirGlobal = permiso?.elegirPlan;
  const setPlanId = useCallback(
    (id: string | null) => {
      setPlanCaido(null);
      setPlanLocal(id);
      elegirGlobal?.(id);
    },
    [setPlanLocal, elegirGlobal],
  );
  const [periodKey, setPeriodKey] = useLocalStorage<CtpPeriodKey>("loth-extraccion:periodo", "todo");
  const [custom, setCustom] = useLocalStorage<CtpCustomRange>("loth-extraccion:rango", RANGO_VACIO);
  const [especieCruda, setEspecie] = useState<string | null>(null);
  const [datos, setDatos] = useState<ExtraccionResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [planes, setPlanes] = useState<OpcionPlan[]>([]);
  const [haySinPlan, setHaySinPlan] = useState(false);

  const period = useMemo(() => resolveCtpPeriod(periodKey, custom), [periodKey, custom]);
  const query = paramsDeExtraccion(planId, period).toString();

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/plan", { credentials: "include", signal: ac.signal });
        if (!r.ok) return;
        const j = await leerJson<{ plans?: PlanCrudo[] }>(r);
        const lista = (j?.plans ?? []).flatMap((p): OpcionPlan[] => {
          const id = texto(p.id);
          if (!id) return [];
          const titular = texto(p.titularName);
          return [{ id, etiqueta: texto(p.planNumber) ?? texto(p.alias) ?? titular ?? "Plan sin número", detalle: titular }];
        });
        if (!ac.signal.aborted) setPlanes(lista);
      } catch (err) {
        /* El selector se queda con lo que ya haya: la vista «Todos» sigue sirviendo. */
        if (!ac.signal.aborted) logger.warn("[loth-extraccion] no se pudo leer la lista de planes", { error: String(err) });
      }
    })();
    return () => ac.abort();
  }, [reloadSignal]);

  useEffect(() => {
    /* Con el permiso del libro todavía sin leer, `planId` puede ser el recordado de antes: no se pide aún. */
    if (!permisoListo) return;
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/admin/forestal/loth/extraccion${query ? `?${query}` : ""}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (r.status === 404 && planId) {
          setPlanCaido(planId);
          if (planLocal === planId) setPlanLocal(null);
          return;
        }
        const json = await leerJson<unknown>(r);
        if (ac.signal.aborted) return;
        if (!r.ok) {
          const msg = (json as { message?: unknown } | null)?.message;
          setError(r.status === 400 && typeof msg === "string" ? msg : mensajeDeEstado(r.status));
          return;
        }
        const d = leerExtraccion(json);
        if (ac.signal.aborted) return;
        if (!d) {
          setError("La respuesta del servidor no trae la extracción.");
          return;
        }
        setDatos(d);
        if (!planId) setHaySinPlan(d.permisos.some((p) => !p.planId));
      } catch (err) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error && err.message ? `No se pudo leer la extracción: ${err.message}` : "No se pudo leer la extracción.");
      } finally {
        if (!ac.signal.aborted) setCargando(false);
      }
    })();
    return () => ac.abort();
  }, [query, intento, reloadSignal, planId, permisoListo, planLocal, setPlanLocal]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  /* Unir un plan con su permiso (acá o en Plan de Manejo) cambia el permiso de
     la fila y quita su aviso: se vuelve a leer. */
  useEffect(() => alCambiarPlanPermiso(reintentar), [reintentar]);
  const elegirPlan = useCallback(
    (id: string | null) => {
      setPlanId(id);
      setEspecie(null);
    },
    [setPlanId],
  );
  const especie = especieCruda && datos?.especies.some((e) => e.clave === especieCruda) ? especieCruda : null;

  return {
    datos,
    cargando,
    error,
    reintentar,
    planes,
    haySinPlan,
    planId,
    elegirPlan,
    periodKey,
    custom,
    period,
    elegirPeriodo: setPeriodKey,
    elegirRango: setCustom,
    especie,
    elegirEspecie: setEspecie,
  };
}
