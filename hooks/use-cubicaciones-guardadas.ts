"use client";

/**
 * use-cubicaciones-guardadas — el historial de cubicaciones del tenant.
 *
 * Vive acá arriba porque lo necesitan DOS paneles de Resúmenes (comparar contra
 * un lote anterior y la tendencia del mix): con el fetch adentro de uno, el otro
 * se quedaba sin datos o se pedía dos veces la misma lista.
 */
import { useEffect, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

export function useCubicacionesGuardadas(): { lista: CubicacionRegistro[]; cargando: boolean } {
  const [lista, setLista] = useState<CubicacionRegistro[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cubicaciones: [] }))
      .then((j: { cubicaciones?: CubicacionRegistro[] }) => { if (vivo) setLista(j.cubicaciones ?? []); })
      // Sin historial los paneles que dependen de él simplemente no aparecen.
      .catch(() => { if (vivo) setLista([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  return { lista, cargando };
}
