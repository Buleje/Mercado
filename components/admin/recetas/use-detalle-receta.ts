"use client";

/** La receta abierta en el panel lateral y su análisis de costo (`cost-breakdown`, calculado por el servidor). */
import { useCallback, useState } from "react";
import type { RecetaCostBreakdown } from "@/lib/types/recetas";
import type { Receta } from "./tipos";

export function useDetalleReceta() {
  const [detalle, setDetalle] = useState<Receta | null>(null);
  const [costData, setCostData] = useState<RecetaCostBreakdown | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  const abrir = useCallback(async (receta: Receta) => {
    setDetalle(receta);
    setCostData(null);
    setCostLoading(true);
    try {
      const [detailRes, costRes] = await Promise.allSettled([
        fetch(`/api/recetas/${receta.id}`),
        fetch(`/api/recetas/${receta.id}/cost-breakdown`),
      ]);
      if (detailRes.status === "fulfilled" && detailRes.value.ok) setDetalle(await detailRes.value.json());
      if (costRes.status === "fulfilled" && costRes.value.ok) setCostData(await costRes.value.json());
    } catch {
      // Si el detalle falla se queda con los datos de la lista.
    } finally {
      setCostLoading(false);
    }
  }, []);

  const cerrar = useCallback(() => setDetalle(null), []);
  return { detalle, costData, costLoading, abrir, cerrar };
}
