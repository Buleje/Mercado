"use client";

import { useCallback, useEffect, useState } from "react";
import type { FichaDeProveedor } from "@/lib/compras/ficha-proveedor";

/** Lo que devuelve `GET /api/suppliers/:id/ficha`: sin `veDeuda`, las cuentas vienen vacías. */
export type FichaConPermiso = FichaDeProveedor & { veDeuda: boolean };

/**
 * La ficha de consulta de UN proveedor (C33/C39): órdenes, recepciones,
 * devoluciones, cuentas y el resumen que arma el servidor. Guarda el id con el
 * dato para que la ficha de otro proveedor nunca se vea mientras carga la nueva.
 */
export function useFichaDeProveedor(id: string | null) {
  const [estado, setEstado] = useState<{ id: string; ficha: FichaConPermiso } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/suppliers/${encodeURIComponent(id)}/ficha`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (r) => {
        const cuerpo: unknown = await r.json().catch(() => null);
        if (!r.ok) {
          const msg = cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : null;
          throw new Error(msg ?? "No se pudo abrir la ficha del proveedor.");
        }
        setEstado({ id, ficha: cuerpo as FichaConPermiso });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No se pudo abrir la ficha del proveedor.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [id, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const ficha = estado && estado.id === id ? estado.ficha : null;
  return { ficha, error: id ? error : null, cargando: !!id && (cargando || (!ficha && !error)), recargar };
}
