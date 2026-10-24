"use client";

/**
 * La bandeja «Revisar pendientes» (C64): trae los casos del servidor y recuerda
 * en este navegador cuáles ya revisaste. Un caso revisado vuelve a aparecer si
 * cambia lo que dice (su `firma`: otra diferencia, otro producto sin costo).
 *
 * La primera carga espera a que la vista de abajo termine de pedir lo suyo
 * (1,5 s): el contador del botón no compite con la pantalla que estás usando.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BandejaExcepciones, Excepcion } from "@/lib/compras/excepciones-compras";
import { logger } from "@/lib/logger";

const CLAVE_REVISADAS = "bsm-compras-revisadas";
const ESPERA_PRIMERA_CARGA_MS = 1500;

type Revisadas = Record<string, string>;

function leerRevisadas(): Revisadas {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_REVISADAS) ?? "{}") as unknown;
    return crudo && typeof crudo === "object" && !Array.isArray(crudo) ? (crudo as Revisadas) : {};
  } catch {
    return {};
  }
}

function guardarRevisadas(r: Revisadas) {
  try {
    localStorage.setItem(CLAVE_REVISADAS, JSON.stringify(r));
  } catch (err) {
    logger.warn("[compras/excepciones] no se pudo guardar lo revisado", { error: String(err) });
  }
}

export const estaRevisada = (e: Excepcion, r: Revisadas) => r[e.id] === e.firma;

export function useExcepcionesCompras() {
  const [bandeja, setBandeja] = useState<BandejaExcepciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisadas, setRevisadas] = useState<Revisadas>(() => (typeof window === "undefined" ? {} : leerRevisadas()));

  const cargar = useCallback(async (signal?: AbortSignal) => {
    setCargando(true);
    try {
      const r = await fetch("/api/compras/excepciones", { signal });
      if (r.status === 403) throw new Error("Tu rol no puede revisar los pendientes de Compras.");
      if (!r.ok) throw new Error("No pudimos revisar los pendientes. Prueba de nuevo.");
      setBandeja((await r.json()) as BandejaExcepciones);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      logger.warn("[compras/excepciones] fetch failed", { error: String(err) });
      setError(err instanceof Error ? err.message : "No pudimos revisar los pendientes.");
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => void cargar(ctrl.signal), ESPERA_PRIMERA_CARGA_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [cargar]);

  /** Marca o desmarca un caso; de paso olvida los que ya no están en la bandeja. */
  const alternarRevisada = useCallback(
    (e: Excepcion) => {
      setRevisadas((antes) => {
        const vivos = new Set(bandeja?.grupos.flatMap((g) => g.excepciones.map((x) => x.id)) ?? []);
        const nuevas: Revisadas = {};
        for (const [id, firma] of Object.entries(antes)) if (vivos.size === 0 || vivos.has(id)) nuevas[id] = firma;
        if (estaRevisada(e, antes)) delete nuevas[e.id];
        else nuevas[e.id] = e.firma;
        guardarRevisadas(nuevas);
        return nuevas;
      });
    },
    [bandeja],
  );

  const sinRevisar = useMemo(
    () => (bandeja ? bandeja.grupos.reduce((s, g) => s + g.excepciones.filter((e) => !estaRevisada(e, revisadas)).length, 0) : null),
    [bandeja, revisadas],
  );

  return { bandeja, cargando, error, recargar: cargar, revisadas, alternarRevisada, sinRevisar };
}
