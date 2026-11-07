"use client";

/**
 * use-cubicaciones-guardadas — el historial de cubicaciones del tenant.
 *
 * Vive acá arriba porque lo necesitan DOS paneles de Resúmenes (comparar contra
 * un lote anterior y la tendencia del mix): con el fetch adentro de uno, el otro
 * se quedaba sin datos o se pedía dos veces la misma lista.
 */
import { useCallback, useEffect, useState } from "react";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

export function useCubicacionesGuardadas(): {
  lista: CubicacionRegistro[];
  cargando: boolean;
  /** Vuelve a leer (ADR-445: tras un 409, la guardada que se tenía ya no es la vigente). */
  recargar: () => void;
} {
  const [lista, setLista] = useState<CubicacionRegistro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/cubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cubicaciones: [] }))
      .then((j: { cubicaciones?: CubicacionRegistro[] }) => { if (vivo) setLista(j.cubicaciones ?? []); })
      // Sin historial los paneles que dependen de él simplemente no aparecen.
      .catch(() => { if (vivo) setLista([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [version]);

  const recargar = useCallback(() => {
    setCargando(true);
    setVersion((v) => v + 1);
  }, []);

  return { lista, cargando, recargar };
}
