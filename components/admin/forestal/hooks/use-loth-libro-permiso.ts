"use client";

/**
 * useLothLibroPermiso — EL permiso con el que se mira todo el Libro TH.
 *
 * 02-10-2026 (Brandon: «al lado de la carátula, para cambiar de permiso; que
 * funcione como un filtro en saldos, aserrío y demás, y como acceso directo al
 * crear registros»): era el filtro de «Secciones» y cada vista tenía su propio
 * selector (seis sueltos, medido). Ahora lo calcula el libro UNA vez y lo da a
 * todas sus vistas por `LothPermisoContext`; una vista con selector propio
 * escribe acá, así que elegir en cualquier lado vale en todas.
 *
 *   · Los planes salen de `GET /api/admin/forestal/plan` (los vivos).
 *   · Lo elegido se RECUERDA en este navegador, por negocio (`tenantKey`):
 *     dos negocios en el mismo navegador no se pisan el permiso.
 *   · Un permiso recordado que ya no está vivo (dado de baja) vuelve a «Todos»
 *     y lo avisa (`seCayo`): no se filtra en silencio contra un plan muerto.
 *   · Sin elección y con un solo plan vivo, ése (misma regla que el Control).
 *   · `listo` = ya se sabe qué permiso vale: sin elección guardada hay que
 *     esperar la lista, o la tabla se pediría con «Todos» para cambiar al
 *     único plan medio segundo después.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { tenantKey, useTenantSlug } from "@/contexts/tenant-context";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { logger } from "@/lib/logger";
import {
  filtroDeSeleccion,
  PERMISO_SIN_PLAN,
  permisoElegido,
  queryDelPermiso,
} from "@/lib/forestal/loth-filtro-permiso";
import { AUTO, planDesdeJson, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { leerPlanesDelLibro } from "./planes-del-libro";

/** Clave de la preferencia, por negocio (la prueba en navegador la lee). */
/** Uno solo para todos los renders: `planes ?? []` daba un arreglo nuevo cada vez y las vistas releían. */
const SIN_PLANES: PlanTablero[] = [];

export const claveDelPermiso = (slug: string) => tenantKey(slug, "loth:permiso");

export function useLothLibroPermiso(reloadSignal = 0) {
  const slug = useTenantSlug();
  const [guardado, setGuardado] = useLocalStorage<string | null>(claveDelPermiso(slug), AUTO);
  const [planes, setPlanes] = useState<PlanTablero[] | null>(null);
  /* Falló la lista (red, 429): NO es «no hay planes». Se deja `planes` como estaba
     (null = no se sabe) para no declarar «se dio de baja» un permiso vivo ni
     soltar el filtro en silencio; el chip ofrece reintentar. */
  const [errorLista, setErrorLista] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        // Compartida con el tablero y su contexto (una consulta en vuelo, 04-10).
        const j = (await leerPlanesDelLibro()) as { plans?: unknown[] } | null;
        const lista = (j?.plans ?? [])
          .map(planDesdeJson)
          .filter((p): p is PlanTablero => p != null);
        if (!ac.signal.aborted) {
          setPlanes(lista);
          setErrorLista(false);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        /* Sin la lista, el libro sigue sirviendo con lo recordado (o «Todos»). */
        logger.warn("[loth-libro] no se pudo leer la lista de planes", { error: String(err) });
        setErrorLista(true);
      }
    })();
    return () => ac.abort();
  }, [reloadSignal, intento]);

  const planSel = permisoElegido(guardado, planes);
  /* Había un plan recordado y ya no está entre los vivos: se ve «Todos» y se avisa. */
  const seCayo =
    planes != null &&
    guardado != null &&
    guardado !== AUTO &&
    planSel == null &&
    guardado !== PERMISO_SIN_PLAN;
  const plan = useMemo(() => planes?.find((p) => p.id === planSel) ?? null, [planes, planSel]);
  const filtro = useMemo(() => filtroDeSeleccion(planSel), [planSel]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const elegirPlan = useCallback((id: string | null) => setGuardado(id), [setGuardado]);

  return {
    planes: planes ?? SIN_PLANES,
    planSel,
    plan,
    filtro,
    /** La query del filtro (`planId=…&solo=1`), `""` = el libro entero. Primitiva: sirve de dependencia. */
    query: queryDelPermiso(filtro),
    listo: guardado !== AUTO || planes != null || errorLista,
    /** La lista de permisos no llegó (no es que no haya): el chip ofrece reintentar. */
    errorLista,
    reintentar,
    /** El permiso recordado se dio de baja: se muestra «Todos» con aviso. */
    seCayo,
    elegirPlan,
  };
}

export type LothLibroPermiso = ReturnType<typeof useLothLibroPermiso>;

/**
 * El permiso del libro para sus vistas. Lo provee `LothLibroOperaciones`; fuera
 * del libro (una vista montada en otro módulo) es `null` y la vista sigue con su
 * comportamiento de siempre.
 */
export const LothPermisoContext = createContext<LothLibroPermiso | null>(null);
export const useLothPermiso = () => useContext(LothPermisoContext);
