"use client";

import { useCallback, useState } from "react";
import type { PlantasListaResponse } from "@/lib/superadmin/plantas-forestales/tipos";
import { escribirSuperadmin, useCargaSuperadmin } from "./use-carga";
import { usePeriodo } from "./use-periodo";

/** Lista de plantas del período elegido + «Recalcular» (salta la caché de 5 min). */
export function usePlantas() {
  const periodo = usePeriodo();
  const [incluirPrueba, setIncluirPrueba] = useState(false);
  const q = new URLSearchParams({
    desde: periodo.rango.desde,
    hasta: periodo.rango.hasta,
    incluirPrueba: incluirPrueba ? "1" : "0",
  });
  const carga = useCargaSuperadmin<PlantasListaResponse>(`/api/superadmin/plantas?${q.toString()}`);
  const [recalculando, setRecalculando] = useState(false);
  const [errorRecalculo, setErrorRecalculo] = useState<string | null>(null);
  const { recargar } = carga;

  const recalcular = useCallback(async () => {
    setRecalculando(true);
    setErrorRecalculo(null);
    const err = await escribirSuperadmin("/api/superadmin/plantas/refrescar", "POST", {});
    setRecalculando(false);
    if (err) setErrorRecalculo(err);
    else recargar();
  }, [recargar]);

  return { ...carga, periodo, incluirPrueba, setIncluirPrueba, recalcular, recalculando, errorRecalculo };
}
