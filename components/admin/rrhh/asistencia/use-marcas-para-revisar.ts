"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { csrfHeaders } from "@/lib/csrf-client";
import { sinDato } from "@/lib/errores/sin-dato";
import { sumarDias } from "@/lib/rrhh/fechas";
import { marcasParaRevisar, type HorarioDelPuesto, type MarcaParaRevisar } from "@/lib/rrhh/marcas-para-revisar";
import type { HojaAsistenciaDTO } from "@/lib/rrhh/tipos";

/** Cuántos días hacia atrás se mira. Más viejo ya se cobró o se pagó: se corrige desde la hoja. */
export const DIAS_A_REVISAR = 14;

/**
 * Datos de «Marcas para revisar»: la hoja de los últimos 14 días (la misma
 * ruta de la asistencia), las marcas ya aprobadas y los horarios de los
 * puestos. Aprobar guarda en `/api/rrhh/asistencia/revisadas`.
 */
export function useMarcasParaRevisar(hoyInicial: string, clave: string) {
  const [hoja, setHoja] = useState<HojaAsistenciaDTO | null>(null);
  const [aprobadas, setAprobadas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [aprobando, setAprobando] = useState<Set<string>>(new Set());
  const { puestos } = useRrhhPuestos();

  useEffect(() => {
    let vigente = true;
    setError(false);
    const desde = sumarDias(hoyInicial, -(DIAS_A_REVISAR - 1));
    Promise.all([
      fetch(`/api/rrhh/asistencia?desde=${desde}&hasta=${hoyInicial}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("hoja");
        return r.json() as Promise<HojaAsistenciaDTO>;
      }),
      fetch("/api/rrhh/asistencia/revisadas", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("revisadas");
        return r.json() as Promise<{ ids: string[] }>;
      }),
    ])
      .then(([h, r]) => {
        if (!vigente) return;
        setHoja(h);
        setAprobadas(new Set(r.ids));
      })
      .catch((err) => {
        sinDato("marcas para revisar")(err);
        if (vigente) setError(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [hoyInicial, clave]);

  const horarios = useMemo(() => {
    const m = new Map<string, HorarioDelPuesto>();
    for (const p of puestos) m.set(p.id, { horaEntrada: p.horaEntrada, toleranciaMin: p.toleranciaMin });
    return m;
  }, [puestos]);

  const lista: MarcaParaRevisar[] = useMemo(
    () => (hoja ? marcasParaRevisar({ marcas: hoja.marcas, colaboradores: hoja.colaboradores, horarios, hoy: hoja.hoy, revisadas: aprobadas }) : []),
    [hoja, horarios, aprobadas],
  );

  const aprobar = useCallback(async (ids: string[]) => {
    setAprobando((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch("/api/rrhh/asistencia/revisadas", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAprobadas((prev) => new Set([...prev, ...ids]));
    } catch (err) {
      sinDato("aprobar marcas")(err);
      toast.error("No se pudo aprobar. Intenta de nuevo.");
    } finally {
      setAprobando((prev) => {
        const s = new Set(prev);
        for (const id of ids) s.delete(id);
        return s;
      });
    }
  }, []);

  return { lista, cargando, error, aprobando, aprobar };
}
