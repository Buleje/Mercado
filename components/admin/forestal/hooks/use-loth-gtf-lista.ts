"use client";

/**
 * useLothGtfLista — lo que lee la vista GTF del Libro TH: las guías emitidas
 * (con su estado en el Libro CTP, `conCtp=1`), cuáles esperan ingresar al CTP,
 * y el cruce inverso contra el libro (guías que el libro declara y nadie
 * emitió acá; líneas de despacho vivas por guía). Salió de `LothGtfView`
 * (08-10, la vista pasaba de 960 líneas) sin cambiar lo que pide ni cómo.
 */

import { useCallback, useEffect, useState } from "react";
import type { Gtf } from "../gtf-tabla-columnas";

export function useLothGtfLista(permisoListo: boolean, permisoQuery: string, reloadSignal?: number) {
  const [gtfs, setGtfs] = useState<Gtf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Puente inverso: GTF de trozas emitidas que aún no ingresaron al CTP —
  // mismo conjunto que la bandeja del lado planta (single source: ?sinIngresar=1).
  const [sinIngresar, setSinIngresar] = useState<Set<string>>(new Set());
  /** Guías que el LIBRO declara y que no están emitidas acá (se piden aparte). */
  const [declaradasSinEmitir, setDeclaradasSinEmitir] = useState<string[]>([]);
  /** Cuántas líneas de despacho vivas lleva cada guía: anularla las libera. */
  const [despachosPorGuia, setDespachosPorGuia] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    if (!permisoListo) return;
    setLoading(true);
    setError(null);
    try {
      const [rGtf, rPend] = await Promise.all([
        /* `conCtp=1`: cada guía de trozas trae si ya entró al Libro CTP (columna Estado). */
        fetch(`/api/admin/forestal/gtf?conCtp=1${permisoQuery ? `&${permisoQuery}` : ""}`, { credentials: "include" }),
        fetch("/api/admin/forestal/gtf?sinIngresar=1", { credentials: "include" }),
      ]);
      let emitidas: Gtf[] = [];
      if (rGtf.ok) {
        emitidas = ((await rGtf.json()).gtfs ?? []) as Gtf[];
        setGtfs(emitidas);
      } else {
        /* Sin lista no se deja la del filtro anterior a la vista: se vacía y se dice. */
        setGtfs([]);
        setError(`No se pudo leer la lista de guías (HTTP ${rGtf.status}).`);
      }
      if (rPend.ok) {
        const pend = ((await rPend.json()).gtfs ?? []) as { gtfNumber: string }[];
        setSinIngresar(new Set(pend.map((g) => g.gtfNumber)));
      }

      // El cruce inverso: guías que el LIBRO declara en sus despachos y que
      // nadie emitió acá. Hasta ahora sólo se veía en Cumplimiento, que es
      // donde menos sirve — el que puede emitirla está en esta pantalla.
      try {
        const rLib = await fetch(`/api/admin/forestal/loth?limit=500${permisoQuery ? `&${permisoQuery}` : ""}`, { credentials: "include" });
        if (rLib.ok) {
          const lineas = ((await rLib.json()).entries ?? []) as { section: string; gtfNumber: string | null; status: string }[];
          /* El cruce compara contra TODAS las emitidas: una guía vieja sin plan no se acusa de «sin emitir» por el filtro. */
          let paraCruce = emitidas;
          if (permisoQuery) {
            const rTodas = await fetch("/api/admin/forestal/gtf", { credentials: "include" });
            if (!rTodas.ok) throw new Error(`HTTP ${rTodas.status}`);
            paraCruce = ((await rTodas.json()).gtfs ?? []) as Gtf[];
          }
          const vivas = new Set(paraCruce.filter((g) => g.status !== "anulada").map((g) => g.gtfNumber));
          const declaradas = new Set(
            lineas
              .filter((l) => l.status !== "anulado" && (l.section === "despacho_troza" || l.section === "despacho_producto") && l.gtfNumber)
              .map((l) => l.gtfNumber as string),
          );
          setDeclaradasSinEmitir([...declaradas].filter((g) => !vivas.has(g)).sort());
          const porGuia = new Map<string, number>();
          for (const l of lineas) {
            if (l.status === "anulado" || l.section !== "despacho_troza" || !l.gtfNumber) continue;
            porGuia.set(l.gtfNumber, (porGuia.get(l.gtfNumber) ?? 0) + 1);
          }
          setDespachosPorGuia(porGuia);
        }
      } catch (err) {
        // Falla blanda: sin el cruce no se acusa a nadie.
        console.warn("[loth-gtf] no se pudo cruzar el libro contra las guías emitidas", err);
      }
    } catch (e) {
      setGtfs([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [permisoListo, permisoQuery]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  return { gtfs, loading, error, setError, sinIngresar, declaradasSinEmitir, despachosPorGuia, load };
}
