"use client";

/**
 * use-trozas-para-codigo — las trozas del patio que se ofrecen en el campo
 * «Código» de «Producir sin lote».
 *
 * Se pide UNA vez, al montar el modal: el cubicador se desmonta y se vuelve a
 * montar al ir y volver del paso «declarar», y pedir el patio en cada vuelta
 * sería pagar la lectura por nada. `ctpGet` además comparte el pedido si otra
 * vista del libro pide lo mismo al mismo tiempo.
 *
 * Si falla, el campo sigue funcionando sin sugerencias y lo dice: el código es
 * una anotación interna, no puede quedar bloqueado por una lectura.
 */

import { useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { trozasParaCodigo, type FuenteCodigoDeTroza } from "@/lib/forestal/codigo-de-troza";

const API = "/api/admin/forestal/trozas/patio";

export function useTrozasParaCodigo(): FuenteCodigoDeTroza {
  const [estado, setEstado] = useState<FuenteCodigoDeTroza>({ trozas: [], cargando: true, error: null });

  useEffect(() => {
    let vivo = true;
    ctpGet<{ trozas?: TrozaConsumible[] }>(API)
      .then((r) => {
        if (vivo) setEstado({ trozas: trozasParaCodigo(r.trozas ?? []), cargando: false, error: null });
      })
      .catch((err: unknown) => {
        logger.warn("[codigo-de-troza] no se pudo leer el patio", { error: String(err) });
        if (vivo) {
          setEstado({
            trozas: [],
            cargando: false,
            error: "No se pudieron leer las trozas del patio: escribe el código igual, sin sugerencias.",
          });
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  return estado;
}
