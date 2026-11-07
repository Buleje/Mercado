"use client";

import { useEffect, useState } from "react";
import { IGV_RATE, igvRateFromSettings } from "@/lib/tax";
import { logger } from "@/lib/logger";

/** Una sola consulta por pestaña: el formulario de producto se abre muchas veces. */
let consulta: Promise<number> | null = null;

function leerTasa(): Promise<number> {
  consulta ??= fetch("/api/settings", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { taxRate?: number | null } | null) => igvRateFromSettings(d?.taxRate))
    .catch((err) => {
      logger.warn("[producto] tasa de IGV sin respuesta, se usa la de siempre", { error: String(err) });
      consulta = null;
      return IGV_RATE;
    });
  return consulta;
}

/** La tasa de IGV de la tienda (Ajustes › Cobros) como fracción: 0,18. Mientras carga, 18 %. */
export function useTasaIgv(): number {
  const [tasa, setTasa] = useState(IGV_RATE);
  useEffect(() => {
    let vivo = true;
    void leerTasa().then((t) => { if (vivo) setTasa(t); });
    return () => { vivo = false; };
  }, []);
  return tasa;
}
