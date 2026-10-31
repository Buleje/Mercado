"use client";

/** Catálogo de permisos CITES del libro (KV, sin migración): leerlo y editarlo en memoria. */

import { useCallback, useEffect, useState } from "react";
import type { LothCitesPermiso } from "@/lib/forestal/loth-cites-types";

export function useLothCitesPermisos() {
  const [permisos, setPermisos] = useState<LothCitesPermiso[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/loth/cites", { credentials: "include" });
        if (!r.ok || cancel) return;
        const cat = (await r.json()).catalogo;
        if (!cancel) setPermisos(cat?.permisos ?? []);
      } catch {
        /* el catálogo es best-effort: sin él, la carátula igual se edita */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const agregar = useCallback(() => setPermisos((p) => [...p, { especie: "", numero: "", vencimiento: "" }]), []);
  const quitar = useCallback((i: number) => setPermisos((p) => p.filter((_, j) => j !== i)), []);
  const cambiar = useCallback(
    (i: number, k: keyof LothCitesPermiso, v: string) =>
      setPermisos((p) => p.map((row, j) => (j === i ? { ...row, [k]: v } : row))),
    [],
  );
  return { permisos, agregar, quitar, cambiar };
}
