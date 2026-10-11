"use client";

/**
 * Los números de chaleco que la IA leyó y no son de nadie: «Asignar chalecos»
 * los ofrece para asignarlos sin tipearlos. Cuenta FOTOS, no lecturas
 * repetidas (un número leído dos veces en la misma foto suma uno).
 *
 * Salió de `CamarasView` el 10-10 para que la pantalla quede bajo 300 líneas.
 */

import { useMemo } from "react";
import { normalizarChaleco } from "@/lib/camaras/cruces";
import type { DatosCamaras } from "./use-camaras";

export function useVistosSinAsignar(
  capturas: DatosCamaras["capturas"],
  chalecos: DatosCamaras["chalecos"],
): Array<{ numero: string; fotos: number }> {
  return useMemo(() => {
    const fotos = new Map<string, number>();
    for (const c of capturas) {
      const numeros = new Set<string>();
      for (const x of c.cruces?.chalecos ?? []) if (!x.colaboradorId) numeros.add(x.numero);
      for (const n of c.lectura?.chalecos ?? []) {
        const k = normalizarChaleco(n);
        if (k && !chalecos[k]) numeros.add(k);
      }
      for (const n of numeros) if (!chalecos[n]) fotos.set(n, (fotos.get(n) ?? 0) + 1);
    }
    return [...fotos.entries()]
      .map(([numero, n]) => ({ numero, fotos: n }))
      .sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
  }, [capturas, chalecos]);
}
