"use client";

/**
 * Guardar las medidas de una o varias trozas (2026-09-26): la cubicación
 * Oxapampa propia (pulgadas y pies → PT) y, si la guía no los trajo, D1/D2 en
 * cm medidos en planta. Lo usan la ficha de la guía («Cubicar Oxapampa») y el
 * patio («Medir escaneando»): una sola forma de escribir, contra
 * `PATCH /api/admin/forestal/trozas/medidas`.
 *
 * El PT lo calcula el SERVIDOR (y lo congela): la pantalla puede mostrar el
 * `ptOxapampa` de `lib/forestal/cubicacion-oxapampa.ts` mientras se tipea, pero
 * lo que queda es lo que vuelve en `trozas`.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { CambioMedidaTroza } from "@/lib/forestal/medidas-troza";
import type { EstadoGuiaMedidas, RespuestaMedidasGuia } from "@/lib/forestal/medidas-desde-guia";

export interface ResultadoMedidas {
  /** Las trozas releídas después de guardar: con su PT del servidor. */
  trozas: TrozaConsumible[];
  /** Las que no se guardaron (o se guardaron a medias), con el porqué. */
  rechazadas: { id: string; motivo: string }[];
}

export function useGuardarMedidas() {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = useCallback(async (cambios: CambioMedidaTroza[]): Promise<ResultadoMedidas | null> => {
    if (cambios.length === 0) return { trozas: [], rechazadas: [] };
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas/medidas", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ trozas: cambios }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<ResultadoMedidas> & { message?: string; error?: string };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp("trozas");
      return { trozas: j.trozas ?? [], rechazadas: j.rechazadas ?? [] };
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las medidas.");
      return null;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { guardar, guardando, error };
}

/* ── «Traer D1/D2 de la guía» (05-10, ADR-469) ───────────────────────────── */

export interface PedidoMedidasGuia {
  gtfNumber: string;
  /** El N° de registro o el enlace del QR, tal como lo pegó el operador. */
  registroOEnlace?: string;
  aplicar?: boolean;
}

const URL_MEDIDAS_GUIA = "/api/admin/forestal/trozas/medidas-guia";

/** Qué guías traen la ficha guardada (una sola lectura para toda la planilla). */
export async function leerEstadoGuias(gtfs: readonly string[]): Promise<EstadoGuiaMedidas[]> {
  if (gtfs.length === 0) return [];
  const q = new URLSearchParams();
  gtfs.forEach((g) => q.append("gtf", g));
  const r = await fetch(`${URL_MEDIDAS_GUIA}?${q.toString()}`, { credentials: "include" });
  const j = (await r.json().catch(() => ({}))) as { guias?: EstadoGuiaMedidas[]; message?: string; error?: string };
  if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
  return j.guias ?? [];
}

/** Vista previa o escritura de UNA guía. El enlace del QR viaja como `enlaceQr`. */
export function useMedidasDeGuia() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consultar = useCallback(async (p: PedidoMedidasGuia): Promise<RespuestaMedidasGuia | null> => {
    setCargando(true);
    setError(null);
    const texto = (p.registroOEnlace ?? "").trim();
    const esEnlace = /^https?:\/\//i.test(texto) || /nuRegistroGuia=/i.test(texto);
    try {
      const r = await fetch(URL_MEDIDAS_GUIA, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          gtfNumber: p.gtfNumber,
          ...(texto ? (esEnlace ? { enlaceQr: texto } : { numeroRegistro: texto }) : {}),
          aplicar: p.aplicar === true,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<RespuestaMedidasGuia> & { message?: string; error?: string };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      if (p.aplicar) invalidarCtp("trozas");
      return j as RespuestaMedidasGuia;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar la guía.");
      return null;
    } finally {
      setCargando(false);
    }
  }, []);

  return { consultar, cargando, error };
}
