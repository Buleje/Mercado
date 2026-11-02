"use client";

/**
 * Base de los hooks de Buleje IA que leen una lista (conversaciones, memoria,
 * conexiones, modelos): carga con cancelación —una respuesta vieja no pisa a
 * la nueva—, estado de error y `recargar`.
 */
import { useCallback, useEffect, useState } from "react";
import { pedirIa } from "@/components/admin/buleje-ia/api";

export function useBulejeIaLista<T>(url: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    pedirIa<T>(url, { signal: ctrl.signal })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (r.ok) setDatos(r.data);
        else setError(r.error);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setError("No pude cargar esto.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [url, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, setDatos, cargando, error, recargar };
}
