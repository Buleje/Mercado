"use client";

/**
 * useEspeciesSinIngreso — las especies que se asierran sin NINGÚN ingreso de
 * esa especie en el libro (ADR-485). Sin período: la lista es de todo el libro.
 * Vuelve a leer cuando algo invalida el caché del libro (un ingreso nuevo, una
 * corrida anulada) y con «Recargar».
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTO_CTP_INVALIDADO, ctpGet, invalidacionToca, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { EspecieSinIngreso } from "@/lib/forestal/corrida-compra";
import { logger } from "@/lib/logger";

const URL_SIN_INGRESO = "/api/admin/forestal/ctp/especies-sin-ingreso";

export function useEspeciesSinIngreso(): { especies: EspecieSinIngreso[] | undefined; recargar: () => void } {
  /* `undefined` mientras no llegó (o falló): el aviso no afirma nada sin dato. */
  const [especies, setEspecies] = useState<EspecieSinIngreso[] | undefined>(undefined);
  const pedido = useRef(0);

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    ctpGet<{ especies?: EspecieSinIngreso[] }>(URL_SIN_INGRESO)
      .then((j) => {
        if (n === pedido.current) setEspecies(Array.isArray(j?.especies) ? j.especies : []);
      })
      .catch((err) => {
        if (n !== pedido.current) return;
        logger.warn("[ctp-saldos] especies sin ingreso no cargó", { error: String(err) });
        setEspecies(undefined);
      });
  }, []);

  useEffect(() => {
    cargar();
    const alInvalidar = (e: Event) => {
      if (invalidacionToca(e, [URL_SIN_INGRESO])) cargar();
    };
    window.addEventListener(EVENTO_CTP_INVALIDADO, alInvalidar);
    return () => {
      pedido.current += 1;
      window.removeEventListener(EVENTO_CTP_INVALIDADO, alInvalidar);
    };
  }, [cargar]);

  const recargar = useCallback(() => {
    invalidarCtp("especies-sin-ingreso");
  }, []);

  return { especies, recargar };
}
