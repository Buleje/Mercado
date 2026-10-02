"use client";

/**
 * useLothTableroPermiso — el permiso que mira el Control del permiso (ADR-459).
 *
 *   · Los planes salen de `GET /api/admin/forestal/plan` (la lista entera, para
 *     poder ofrecer todos aunque se esté mirando uno).
 *   · El elegido se RECUERDA en este navegador. Uno recordado que ya no existe
 *     (se dio de baja) vuelve a «Todos» en vez de dejar la vista vacía.
 *   · Con un plan elegido trae su saldo (`?balance=<planId>`): sólo cuenta las
 *     líneas de ESE plan (contrato ADR-459 §4). Sólo vale el ÚLTIMO pedido:
 *     cambiar dos veces seguidas no deja el saldo viejo pisando al nuevo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { FilaBalanceCascada } from "@/lib/forestal/loth-saldo-cascada";
import { AUTO, permisoInicial, planDesdeJson, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { PLAN_SIN_PLAN } from "@/lib/forestal/loth-tablero-trozas";

/** Clave de la preferencia (la prueba en navegador la lee). */
export const CLAVE_PLAN_TABLERO = "loth-tablero:plan";

export interface SaldoPermiso {
  /** De qué plan son las filas: al cambiar de plan, las del anterior no se muestran. */
  planId: string | null;
  rows: FilaBalanceCascada[];
  cargando: boolean;
  error: string | null;
}

function mensajeDeEstado(status: number, que: string): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 403) return "El Libro TH no está habilitado para tu usuario o tu negocio.";
  if (status === 404) return "Ese permiso ya no existe.";
  return `No se pudo leer ${que} (error ${status}).`;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function useLothTableroPermiso(reloadSignal = 0) {
  /* Sin elección guardada (`AUTO`): con UN solo permiso vivo se abre en ése —el
     volumen del permiso a la vista sin tocar nada—; con varios, «Todos». Elegir
     «Todos» a mano guarda `null` y se respeta. */
  const [guardado, setGuardado] = useLocalStorage<string | null>(CLAVE_PLAN_TABLERO, AUTO);
  const [planes, setPlanes] = useState<PlanTablero[] | null>(null);
  const [errorPlanes, setErrorPlanes] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<SaldoPermiso>({ planId: null, rows: [], cargando: false, error: null });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/plan", { credentials: "include", signal: ac.signal });
        if (!r.ok) throw new Error(mensajeDeEstado(r.status, "los permisos"));
        const j = await leerJson<{ plans?: unknown[] }>(r);
        const lista = (j?.plans ?? []).map(planDesdeJson).filter((p): p is PlanTablero => p != null);
        if (!ac.signal.aborted) {
          setPlanes(lista);
          setErrorPlanes(null);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        /* Sin la lista, el tablero sigue sirviendo con «Todos». */
        logger.warn("[loth-tablero] no se pudo leer la lista de planes", { error: String(err) });
        setErrorPlanes(err instanceof Error ? err.message : String(err));
        setPlanes((prev) => prev ?? []);
      }
    })();
    return () => ac.abort();
  }, [reloadSignal]);

  /* Un plan recordado que ya no está en la lista se suelta (vuelve a «Todos»). */
  const efectivo = permisoInicial(guardado, planes);
  const planSel: string | null =
    efectivo == null || efectivo === PLAN_SIN_PLAN
      ? efectivo
      : planes == null || planes.some((p) => p.id === efectivo)
        ? efectivo
        : null;
  const plan = useMemo(() => planes?.find((p) => p.id === planSel) ?? null, [planes, planSel]);
  const idSaldo = plan?.id ?? null;

  useEffect(() => {
    if (!idSaldo) {
      setSaldo({ planId: null, rows: [], cargando: false, error: null });
      return;
    }
    const ac = new AbortController();
    /* Recargar el MISMO plan deja ver lo anterior mientras llega; otro plan, no. */
    setSaldo((s) => (s.planId === idSaldo ? { ...s, cargando: true, error: null } : { planId: idSaldo, rows: [], cargando: true, error: null }));
    (async () => {
      try {
        const r = await fetch(`/api/admin/forestal/plan?balance=${encodeURIComponent(idSaldo)}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(mensajeDeEstado(r.status, "el volumen del permiso"));
        const j = await leerJson<{ balance?: { rows?: Record<string, unknown>[] } }>(r);
        const rows: FilaBalanceCascada[] = (j?.balance?.rows ?? []).map((x) => ({
          species: String(x.species ?? "—"),
          cites: x.cites === true,
          autorizado: num(x.autorizado),
          talado: num(x.talado),
          trozado: num(x.trozado),
          movilizado: num(x.movilizado),
          // Sólo lo que salió como TROZA deja el patio: el producto despachado no (ADR-459).
          movilizadoTroza: x.movilizadoTroza == null ? undefined : num(x.movilizadoTroza),
          consumido: num(x.consumido),
        }));
        if (!ac.signal.aborted) setSaldo({ planId: idSaldo, rows, cargando: false, error: null });
      } catch (err) {
        if (ac.signal.aborted) return;
        setSaldo({ planId: idSaldo, rows: [], cargando: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => ac.abort();
  }, [idSaldo, reloadSignal, intento]);

  const elegirPlan = useCallback((id: string | null) => setGuardado(id), [setGuardado]);
  const reintentarSaldo = useCallback(() => setIntento((n) => n + 1), []);

  return { planes: planes ?? [], cargandoPlanes: planes == null, errorPlanes, planSel, plan, elegirPlan, saldo, reintentarSaldo };
}

export type LothTableroPermiso = ReturnType<typeof useLothTableroPermiso>;
