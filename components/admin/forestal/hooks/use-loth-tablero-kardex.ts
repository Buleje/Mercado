"use client";

/**
 * useLothTableroKardex — el Kárdex del permiso en el Control del permiso.
 *
 *   · Las líneas son las del libro ya cargado (`allEntries`): no se piden de nuevo.
 *   · Las especies del permiso sí (`GET /plan/species?planId=`), una vez por
 *     permiso y sólo con la pestaña abierta: el saldo reconoce la especie de una
 *     línea por el común O por el científico del registro (`claveEnElPlan`), y el
 *     balance que ya trae el tablero no manda el científico. Sin eso el kárdex
 *     podía no cuadrar con «Volumen del permiso».
 *   · El cuadre se mide contra la franja (`cascadaDelPlan` del servidor).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { describirError, leerJson } from "@/lib/errores/sin-dato";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  construirKardex,
  cuadrarConCascada,
  type EspecieDelPermiso,
} from "@/lib/forestal/loth-kardex";
import {
  hojasDelKardex,
  htmlKardex,
  nombreArchivoKardex,
  type DatosKardex,
} from "@/lib/forestal/loth-kardex-reporte";
import type { CascadaPlan } from "@/lib/forestal/loth-saldo-cascada";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";

interface EstadoEspecies {
  planId: string | null;
  lista: EspecieDelPermiso[] | null;
  error: string | null;
}

function mensajeDeEstado(status: number): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar.";
  if (status === 403) return "El Libro TH no está habilitado para tu usuario o tu negocio.";
  if (status === 404) return "Ese permiso ya no existe.";
  return `No se pudieron leer las especies del permiso (error ${status}).`;
}

export function useLothTableroKardex({
  entries,
  planId,
  banda,
  franja,
  activo,
  reloadSignal = 0,
  hoyKey,
}: {
  entries: readonly LothEntryDTO[];
  planId: string | null;
  banda: BandaPermiso | null;
  /** La cascada de «Volumen del permiso» (servidor); `null` mientras carga o sin especies. */
  franja: CascadaPlan | null;
  /** La pestaña está a la vista: recién ahí se piden las especies. */
  activo: boolean;
  reloadSignal?: number;
  hoyKey: string;
}) {
  const [especies, setEspecies] = useState<EstadoEspecies>({
    planId: null,
    lista: null,
    error: null,
  });
  const [intento, setIntento] = useState(0);
  /* La especie elegida es del permiso que se mira: al cambiar de permiso, vuelve a «todas». */
  const [filtro, setFiltro] = useState<{ planId: string | null; clave: string | null }>({
    planId: null,
    clave: null,
  });

  useEffect(() => {
    if (!activo || !planId) return;
    const ac = new AbortController();
    setEspecies((s) =>
      s.planId === planId ? { ...s, error: null } : { planId, lista: null, error: null },
    );
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/forestal/plan/species?planId=${encodeURIComponent(planId)}`,
          {
            credentials: "include",
            cache: "no-store",
            signal: ac.signal,
          },
        );
        if (!r.ok) throw new Error(mensajeDeEstado(r.status));
        const j = await leerJson<{ species?: Record<string, unknown>[] }>(r);
        const lista: EspecieDelPermiso[] = (j?.species ?? [])
          .filter((s) => typeof s.speciesCommon === "string")
          .map((s) => ({
            speciesCommon: String(s.speciesCommon),
            speciesScientific: typeof s.speciesScientific === "string" ? s.speciesScientific : null,
            cites: s.cites === true,
            volumenAutorizadoM3: s.volumenAutorizadoM3 as number | string | null,
          }));
        if (!ac.signal.aborted) setEspecies({ planId, lista, error: null });
      } catch (err) {
        if (ac.signal.aborted) return;
        setEspecies({
          planId,
          lista: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => ac.abort();
  }, [activo, planId, reloadSignal, intento]);

  const lista = planId && especies.planId === planId ? especies.lista : null;
  const kardex = useMemo(
    () => (planId && lista ? construirKardex(entries, { planId, especies: lista }) : null),
    [entries, planId, lista],
  );

  const clave =
    filtro.planId === planId && kardex?.especies.some((e) => e.clave === filtro.clave)
      ? filtro.clave
      : null;
  const elegirEspecie = useCallback(
    (c: string | null) => setFiltro({ planId, clave: c }),
    [planId],
  );

  /* Sin especies en el registro, la franja no tiene filas: no hay contra qué cuadrar. */
  const cuadre = useMemo(
    () => (kardex && franja && !kardex.sinBase ? cuadrarConCascada(kardex.cierre, franja) : null),
    [kardex, franja],
  );

  const datos: DatosKardex | null = useMemo(
    () => (kardex && banda ? { kardex, permiso: banda, especie: clave, cuadre, hoyKey } : null),
    [kardex, banda, clave, cuadre, hoyKey],
  );

  const exportarExcel = useCallback(async () => {
    if (!datos) return;
    try {
      await exportSheetsToExcel(hojasDelKardex(datos), nombreArchivoKardex(datos));
    } catch (err) {
      toast.error(`No se pudo armar el Excel: ${describirError(err)}`);
    }
  }, [datos]);

  const imprimir = useCallback(() => {
    if (!datos) return;
    try {
      openCtpReport(htmlKardex(datos));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [datos]);

  return {
    kardex,
    datos,
    clave,
    elegirEspecie,
    cuadre,
    cargando:
      activo && !!planId && lista == null && !(especies.planId === planId && especies.error),
    error: especies.planId === planId ? especies.error : null,
    reintentar: () => setIntento((n) => n + 1),
    exportarExcel,
    imprimir,
  };
}

export type LothTableroKardexEstado = ReturnType<typeof useLothTableroKardex>;
