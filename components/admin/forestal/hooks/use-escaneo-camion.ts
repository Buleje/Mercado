"use client";

/**
 * «Escanear lo que sube al camión» (Despacho de trozas del Libro TH, QR4,
 * 08-10): las trozas que todavía no salieron (las MISMAS que ofrece «Despachar
 * con guía»: `GET /api/admin/forestal/loth/despacho-guia`) y la lista que se
 * va armando al escanear. Una guía sale de UN permiso: la primera troza fija
 * el permiso y la de otro se avisa y no entra; la repetida, «ya estaba».
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrozaDelLibro } from "@/lib/forestal/loth-guia-despacho";
import type { TrozaDelEscaner } from "../escaner-trozas-partes";

/** Lo mismo que acepta `POST /api/admin/forestal/loth/despacho-guia`. */
export const MAX_TROZAS_GUIA = 150;

export type TrozaCamion = TrozaDelEscaner & { planId: string | null; codigo: string };

interface PlanCorto {
  id: string;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
}

export function useEscaneoCamion() {
  const [trozas, setTrozas] = useState<TrozaCamion[] | null>(null);
  const [planes, setPlanes] = useState<PlanCorto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<TrozaCamion[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/loth/despacho-guia", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { trozas?: TrozaDelLibro[]; planes?: PlanCorto[]; message?: string };
        if (!r.ok) throw new Error(j.message ?? `No se pudieron leer las trozas (${r.status}).`);
        if (!vivo) return;
        setPlanes(j.planes ?? []);
        setTrozas(
          (j.trozas ?? []).map((t) => ({
            id: t.id,
            codigo: t.codigo,
            codigoPlanta: t.codigo,
            codificacion: t.codigoGuia ?? null,
            especieComun: t.comun,
            volumenM3: t.volumeM3,
            planId: t.planId,
          })),
        );
      })
      .catch((err: unknown) => vivo && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      vivo = false;
    };
  }, []);

  const nombrePermiso = useCallback(
    (planId: string | null) => {
      const p = planes.find((x) => x.id === planId);
      return p?.planNumber?.trim() || p?.tituloHabilitante?.trim() || (planId ? "otro permiso" : "sin permiso");
    },
    [planes],
  );

  const permiso = lista.length > 0 ? (lista[0]!.planId ?? null) : undefined;
  const bloqueo = useCallback(
    (t: TrozaCamion) => {
      if (permiso !== undefined && (t.planId ?? null) !== permiso)
        return `Es de ${nombrePermiso(t.planId)} y la guía va con ${nombrePermiso(permiso)}: una guía sale de un solo permiso`;
      if (lista.length >= MAX_TROZAS_GUIA) return `La guía ya lleva ${MAX_TROZAS_GUIA} trozas, el máximo`;
      return null;
    },
    [permiso, nombrePermiso, lista.length],
  );
  const agregar = useCallback((t: TrozaCamion) => setLista((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t])), []);
  const quitar = useCallback((id: string) => setLista((prev) => prev.filter((x) => x.id !== id)), []);
  const yaElegidas = useMemo(() => new Set(lista.map((t) => t.id)), [lista]);
  const m3 = useMemo(() => Math.round(lista.reduce((a, t) => a + (t.volumenM3 ?? 0), 0) * 10000) / 10000, [lista]);

  return {
    trozas,
    error,
    lista,
    yaElegidas,
    m3,
    permisoNombre: permiso === undefined ? null : nombrePermiso(permiso),
    bloqueo,
    agregar,
    quitar,
    vaciar: useCallback(() => setLista([]), []),
  };
}
