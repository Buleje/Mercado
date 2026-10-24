"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { SunatModoOficialState } from "@/lib/sunat/modo-oficial.types";

export type CargaEstadoSunat =
  | { fase: "cargando" }
  | { fase: "error" }
  | { fase: "lista"; estado: SunatModoOficialState };

/**
 * El estado de SUNAT del negocio, leído UNA vez por pantalla: lo usan la línea
 * de arriba de Facturas y boletas y la ventana de emisión (antes cada una lo
 * habría pedido por su cuenta).
 */
export function useEstadoSunat(): CargaEstadoSunat {
  const [carga, setCarga] = useState<CargaEstadoSunat>({ fase: "cargando" });
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/sunat/modo-oficial", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; state?: SunatModoOficialState } | null) => {
        setCarga(j?.ok && j.state ? { fase: "lista", estado: j.state } : { fase: "error" });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        logger.warn("[comprobantes] estado SUNAT no se pudo leer", { error: String(err) });
        setCarga({ fase: "error" });
      });
    return () => ac.abort();
  }, []);
  return carga;
}

/** El estado si ya llegó; `null` mientras carga o si falló. */
export function estadoDe(carga: CargaEstadoSunat) {
  return carga.fase === "lista" ? carga.estado : null;
}
