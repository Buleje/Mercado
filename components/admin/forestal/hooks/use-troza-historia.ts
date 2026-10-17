"use client";

/**
 * useTrozaHistoria — la vida de UNA troza con las fechas que el Libro ya guarda
 * (llegó, se apartó, entró a un lote, se aserró, salió). ADR-465: no se
 * inventan estaciones de la planta que el sistema no registra.
 */

import { useEffect, useState } from "react";
import { ordenarEventos } from "@/lib/forestal/planta-croquis";
import type { EventoTroza } from "@/lib/forestal/planta-zona-types";

export function useTrozaHistoria(trozaId: string | null) {
  const [eventos, setEventos] = useState<EventoTroza[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!trozaId) { setEventos(null); return; }
    // Tocar otra troza mientras carga la anterior: la respuesta vieja no pisa.
    let vigente = true;
    setCargando(true); setError(null); setEventos(null);
    fetch(`/api/admin/forestal/ctp/planta/troza/${encodeURIComponent(trozaId)}/historia`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Todavía no hay historia para esta troza." : `HTTP ${r.status}`);
        const j: unknown = await r.json();
        const lista = Array.isArray(j) ? j : ((j as { eventos?: unknown }).eventos ?? []);
        if (vigente) setEventos(ordenarEventos(lista as EventoTroza[]));
      })
      .catch((e: unknown) => { if (vigente) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [trozaId]);

  return { eventos, error, cargando };
}
