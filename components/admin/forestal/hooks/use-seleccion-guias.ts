"use client";

/**
 * Las guías tildadas en la vista GTF del Libro TH (Brandon 07-10: «seleccionar
 * las guías… y usar ese formato»). Una sola selección para las dos pestañas
 * —vigentes y «Anuladas y otras»—: una relación de guías declara las dos.
 *
 * Guarda ids, no guías: la lista se vuelve a pedir tras cada escritura y una
 * guía que ya no está (anulada y borrada, otro permiso elegido) simplemente no
 * se cuenta — la vista cruza los ids con lo que tiene cargado.
 */

import { useCallback, useState } from "react";

export interface SeleccionGuias {
  ids: ReadonlySet<string>;
  tiene: (id: string) => boolean;
  alternar: (id: string) => void;
  /** Tilda (o destilda) todas estas de una vez: las filtradas, no sólo la página. */
  marcar: (ids: readonly string[], tildar: boolean) => void;
  limpiar: () => void;
}

export function useSeleccionGuias(): SeleccionGuias {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const tiene = useCallback((id: string) => ids.has(id), [ids]);
  const alternar = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const marcar = useCallback((lista: readonly string[], tildar: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of lista) {
        if (tildar) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const limpiar = useCallback(() => setIds(new Set()), []);
  return { ids, tiene, alternar, marcar, limpiar };
}
