"use client";

/**
 * useLothLibroPermiso — el permiso con el que se mira la vista «Secciones» del
 * Libro TH (02-10-2026). Filtra la tabla, los contadores por sección, el Excel
 * y el impreso; las otras vistas no lo miran.
 *
 *   · Los planes salen de `GET /api/admin/forestal/plan` (los vivos).
 *   · Lo elegido se RECUERDA en este navegador, con su propia clave: el Control
 *     del permiso tiene la suya y elegir acá no le cambia lo que muestra.
 *   · Sin elección y con un solo plan vivo, ése (misma regla que el Control).
 *   · `listo` = ya se sabe qué permiso vale: sin elección guardada hay que
 *     esperar la lista, o la tabla se pediría con «Todos» para cambiar al
 *     único plan medio segundo después.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { filtroDeSeleccion, permisoElegido, queryDelPermiso } from "@/lib/forestal/loth-filtro-permiso";
import { AUTO, planDesdeJson, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";

/** Clave de la preferencia (la prueba en navegador la lee). */
export const CLAVE_PLAN_LIBRO = "loth-libro:plan";

export function useLothLibroPermiso(reloadSignal = 0) {
  const [guardado, setGuardado] = useLocalStorage<string | null>(CLAVE_PLAN_LIBRO, AUTO);
  const [planes, setPlanes] = useState<PlanTablero[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/plan", { credentials: "include", signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await leerJson<{ plans?: unknown[] }>(r);
        const lista = (j?.plans ?? []).map(planDesdeJson).filter((p): p is PlanTablero => p != null);
        if (!ac.signal.aborted) setPlanes(lista);
      } catch (err) {
        if (ac.signal.aborted) return;
        /* Sin la lista, el libro sigue sirviendo con «Todos» (o lo recordado). */
        logger.warn("[loth-libro] no se pudo leer la lista de planes", { error: String(err) });
        setPlanes((prev) => prev ?? []);
      }
    })();
    return () => ac.abort();
  }, [reloadSignal]);

  const planSel = permisoElegido(guardado, planes);
  const plan = useMemo(() => planes?.find((p) => p.id === planSel) ?? null, [planes, planSel]);
  const filtro = useMemo(() => filtroDeSeleccion(planSel), [planSel]);
  const elegirPlan = useCallback((id: string | null) => setGuardado(id), [setGuardado]);

  return {
    planes: planes ?? [],
    planSel,
    plan,
    filtro,
    /** La query del filtro (`planId=…&solo=1`), `""` = el libro entero. Primitiva: sirve de dependencia. */
    query: queryDelPermiso(filtro),
    listo: guardado !== AUTO || planes != null,
    elegirPlan,
  };
}

export type LothLibroPermiso = ReturnType<typeof useLothLibroPermiso>;
