"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { minimoGlobalDe } from "@/lib/inventario/stock-minimo";

/**
 * El stock mínimo del negocio (`Settings.globalMinStock`) en el cliente, para
 * pasarlo como 2.º argumento a `needsReorder` / `calculateSuggestedQty`
 * (lib/types/purchases): así Compras marca «a reponer» con la misma regla que
 * el cierre del día y las alertas de inventario.
 *
 * Mientras carga, o si la respuesta no trae el campo (sólo se lo da a una
 * sesión del panel), vale 0: el comportamiento de antes, sólo mínimos propios.
 * `cachedJson` comparte la misma petición entre las tarjetas y el hook.
 */
export function useStockMinimoGlobal(): number {
  const [minimo, setMinimo] = useState(0);
  useEffect(() => {
    let vivo = true;
    void cachedJson<{ globalMinStock?: number | null }>("/api/settings", 60_000).then((s) => {
      if (vivo && typeof s?.globalMinStock === "number") setMinimo(minimoGlobalDe(s));
    });
    return () => {
      vivo = false;
    };
  }, []);
  return minimo;
}
