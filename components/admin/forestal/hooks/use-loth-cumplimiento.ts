"use client";

/**
 * Los datos del «Chequeo del libro» (Cumplimiento del Libro TH): las anomalías
 * que ya calcula «Rentabilidad y rendimiento» (`/plan?analytics=1`), la
 * carátula, el catálogo CITES y el cruce guías-del-libro contra guías-emitidas,
 * pasados por `computeLothCompliance` (puro, el MISMO que usa el PDF).
 *
 * Salió de `LothCompliancePanel` (17-10) cuando la vista se partió en
 * «Chequeo» y «Cerrar el mes». La carga es la de siempre, sin cambios.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeLothCompliance, type LothAnomaly, type LothComplianceResult } from "@/lib/forestal/loth-compliance";
import { permisoParaEspecie, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { useLothPermiso } from "./use-loth-libro-permiso";
import { useLothCumplimientoAvanzado } from "./use-loth-cumplimiento-avanzado";

export interface CaratulaCumplimiento {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  representanteLegal?: string | null;
  resolucionNumber?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

export function useLothCumplimiento(totalLineas: number, reloadSignal?: number) {
  const [anomalias, setAnomalias] = useState<LothAnomaly[] | null>(null);
  const [caratula, setCaratula] = useState<CaratulaCumplimiento | null>(null);
  const [citesEspecies, setCitesEspecies] = useState<string[]>([]);
  const [especiesNoAutorizadas, setEspeciesNoAutorizadas] = useState<string[]>([]);
  const [especiesAmbiguas, setEspeciesAmbiguas] = useState<{ libro: string; plan: string }[]>([]);
  /** Guías que el libro declara y que no existen entre las emitidas. */
  const [gtfsFantasma, setGtfsFantasma] = useState<string[]>([]);
  const [citesPermisos, setCitesPermisos] = useState<LothCitesPermiso[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * FIX 2026-08-22: antes el guard de carga usaba `anomalias === null`, que se
   * limpia apenas resuelve el PRIMER `Promise.all` (analytics/carátula/CITES).
   * El cruce de guías (`gtfsFantasma`) es un SEGUNDO bloque `await` más abajo
   * en la misma función — entre uno y otro, React ya renderizaba el veredicto
   * con `gtfsFantasma` todavía en su `[]` inicial: un 100/100 "el libro
   * resiste una fiscalización" falso, que un operador podía leer literal en
   * la mitad de segundo que tarda esa segunda llamada. `ready` sólo se prende
   * al final de TODA `load()` (ambos bloques) — la primera carga espera
   * completa; un "Recargar" posterior no vuelve a bloquear con el spinner
   * (ready ya quedó en true), muestra el dato viejo hasta que llega el nuevo.
   */
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* El permiso del libro (02-10): con un plan elegido, el veredicto es de ESE plan; «Todos» y «Sin plan» = el vigente de siempre. */
  const permiso = useLothPermiso();
  const permisoListo = permiso?.listo ?? true;
  const planDelLibro = permiso?.planSel && permiso.planSel !== PERMISO_SIN_PLAN ? permiso.planSel : null;
  /* Los chequeos avanzados (26-10): guías, árboles, bloques, plan, plazos y fechas, del servidor. */
  const avanzado = useLothCumplimientoAvanzado({ planId: planDelLibro, listo: permisoListo, reloadSignal });
  const recargarAvanzado = avanzado.load;
  const loadBase = useCallback(async () => {
    if (!permisoListo) return;
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes, xRes] = await Promise.all([
        fetch(`/api/admin/forestal/plan?analytics=1${planDelLibro ? `&planId=${encodeURIComponent(planDelLibro)}` : ""}`, { credentials: "include" }),
        fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/cites", { credentials: "include" }),
      ]);
      if (!aRes.ok) {
        const d = await aRes.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${aRes.status}`);
      }
      const analytics = (await aRes.json()).analytics;
      setAnomalias(analytics?.anomalias ?? []);
      setCitesEspecies(analytics?.citesEspecies ?? []);
      setEspeciesNoAutorizadas(analytics?.especiesNoAutorizadas ?? []);
      setEspeciesAmbiguas(analytics?.especiesAmbiguas ?? []);
      if (cRes.ok) setCaratula((await cRes.json()).active ?? null);
      if (xRes.ok) setCitesPermisos((await xRes.json()).catalogo?.permisos ?? []);

      // Cruce guías-del-libro contra guías-emitidas. Falla blanda a propósito:
      // si alguno de los dos lados no se pudo leer, la lista queda VACÍA y el
      // chequeo pasa — nunca se acusa por falta de datos.
      try {
        const [libRes, gtfRes] = await Promise.all([
          fetch("/api/admin/forestal/loth?limit=500", { credentials: "include" }),
          fetch("/api/admin/forestal/gtf", { credentials: "include" }),
        ]);
        if (libRes.ok && gtfRes.ok) {
          const lineas = ((await libRes.json()).entries ?? []) as { section: string; gtfNumber: string | null; status: string }[];
          const emitidas = new Set(
            (((await gtfRes.json()).gtfs ?? []) as { gtfNumber: string; status: string }[])
              .filter((g) => g.status !== "anulada")
              .map((g) => g.gtfNumber),
          );
          const declaradas = new Set(
            lineas
              .filter((l) => l.status !== "anulado" && (l.section === "despacho_troza" || l.section === "despacho_producto") && l.gtfNumber)
              .map((l) => l.gtfNumber as string),
          );
          setGtfsFantasma([...declaradas].filter((g) => !emitidas.has(g)).sort());
        }
      } catch (err) {
        console.warn("[loth-compliance] no se pudo cruzar guías del libro contra emitidas", err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [permisoListo, planDelLibro]);

  useEffect(() => {
    void loadBase();
  }, [loadBase, reloadSignal]);

  /* «Recargar» trae las dos cosas. */
  const load = useCallback(async () => {
    await Promise.all([loadBase(), recargarAvanzado()]);
  }, [loadBase, recargarAvanzado]);

  /*
   * Sin `ready` no hay veredicto (ver el FIX de arriba), y tampoco hasta que
   * los avanzados contesten la primera vez: un 100/100 sin ellos sería falso.
   * Si fallan, el veredicto sale con los de siempre y la vista lo avisa.
   */
  const extra = avanzado.checks;
  const listoTodo = ready && avanzado.terminado;
  const result: LothComplianceResult | null = useMemo(() => {
    if (!listoTodo || anomalias === null) return null;
    const citesSinPermiso = citesEspecies.filter((sp) => !permisoParaEspecie({ permisos: citesPermisos }, sp));
    return computeLothCompliance({ anomalias, caratula, totalLineas, citesSinPermiso, especiesNoAutorizadas, especiesAmbiguas, gtfsFantasma, extra });
  }, [listoTodo, anomalias, caratula, totalLineas, citesEspecies, citesPermisos, especiesNoAutorizadas, especiesAmbiguas, gtfsFantasma, extra]);

  return {
    result,
    caratula,
    loading: loading || avanzado.cargando,
    ready: listoTodo,
    error,
    load,
    avanzado: {
      sinLeer: avanzado.sinLeer,
      leido: avanzado.leido,
      error: avanzado.error,
      ajustes: avanzado.ajustes,
      guardar: avanzado.guardar,
    },
  };
}
