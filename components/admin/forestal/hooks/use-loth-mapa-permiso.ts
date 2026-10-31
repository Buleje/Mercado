"use client";

/**
 * useLothMapaPermiso — el mapa del Libro TH mirado con el permiso de la banda.
 *
 * El chip del libro (02-10-2026) elige el permiso; de él salen el plan, el
 * censo, el POA y las líneas, y —desde el ADR-462— también el área y la
 * cartografía: «Todos» las muestra todas sin escribir en ninguna, un permiso
 * muestra la suya (o la del negocio, heredada) y «Líneas sin permiso» la del
 * negocio. Fuera del libro (`libro` null) todo sigue como antes: el plan
 * activo y el área del negocio.
 *
 * Salió de `LothMapaView` para que la vista siga sólo armando.
 */

import { useMemo } from "react";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { nombreDelPlan } from "@/lib/forestal/loth-tablero-permiso";
import { alcanceDelPermiso, nombrarAreas } from "../loth-mapa-alcance";
import { useLothPermiso } from "./use-loth-libro-permiso";
import { useLothMapaDatos } from "./use-loth-mapa-datos";

/** Referencias estables: un `[]` nuevo por render re-dispararía los hooks derivados. */
const SIN_ARBOLES: never[] = [];
const SIN_ESPECIES: never[] = [];

export function useLothMapaPermiso() {
  const libro = useLothPermiso();
  const hayLibro = libro != null;
  const planSel = libro?.planSel ?? null;
  const planDelLibro = planSel && planSel !== PERMISO_SIN_PLAN ? planSel : null;
  const alcance = useMemo(() => alcanceDelPermiso(hayLibro, planSel), [hayLibro, planSel]);
  const crudos = useLothMapaDatos({ planId: planDelLibro, filtro: libro?.filtro ?? null, alcance });
  /* «Sin permiso»: ningún censo ni plan (mismo criterio que Trazabilidad); el hook trae el del plan activo y acá se descarta. */
  const datos = planSel === PERMISO_SIN_PLAN ? { ...crudos, trees: SIN_ARBOLES, planSpecies: SIN_ESPECIES, plan: null } : crudos;

  const planes = libro?.planes;
  const nombres = useMemo(() => Object.fromEntries((planes ?? []).map((p) => [p.id, nombreDelPlan(p)])), [planes]);
  const areasNombradas = useMemo(() => nombrarAreas(datos.areasOtras, nombres), [datos.areasOtras, nombres]);
  /* Estables: el canvas es `memo` y redibuja sus capas si cambian. */
  const capasPermiso = useMemo(
    () => ({ areasOtras: areasNombradas.map((a) => ({ nombre: a.nombre, vertices: a.parcela.vertices })), contexto: datos.contexto }),
    [areasNombradas, datos.contexto],
  );
  const dds = useMemo(() => (hayLibro ? { permiso: planSel, nombres } : {}), [hayLibro, planSel, nombres]);

  return {
    datos,
    hayLibro,
    /** El plan elegido en la banda (no «sin plan»). */
    planDelLibro,
    todos: alcance.tipo === "todos",
    /** Cómo se llama el permiso elegido (para el aviso del área heredada y el predio). */
    nombrePermiso: planDelLibro ? (nombres[planDelLibro] ?? datos.plan?.planNumber ?? "Este permiso") : null,
    elegirPlan: libro?.elegirPlan ?? null,
    areasNombradas,
    capasPermiso,
    dds,
  };
}
