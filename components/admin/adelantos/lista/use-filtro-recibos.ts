"use client";

import { useCallback, useEffect, useState } from "react";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { CLAVE_FILTRO_RECIBOS, type FiltroRecibos, SIN_FILTRO_RECIBOS, leerFiltroRecibos } from "@/lib/adelantos/filtro-recibos";

/** «Sin firma» / «Sin enviar» recordados en el navegador (por negocio). Se leen al montar: sin choque de hidratación. */
export function useFiltroRecibos(): [FiltroRecibos, (cambio: Partial<FiltroRecibos>) => void] {
  const [filtro, setFiltro] = useState<FiltroRecibos>(SIN_FILTRO_RECIBOS);

  useEffect(() => {
    try {
      setFiltro(leerFiltroRecibos(window.localStorage.getItem(tenantCacheKey(CLAVE_FILTRO_RECIBOS))));
    } catch {
      /* sin persistencia: el filtro funciona igual */
    }
  }, []);

  const cambiar = useCallback((cambio: Partial<FiltroRecibos>) => {
    setFiltro((antes) => {
      const nuevo = { ...antes, ...cambio };
      try {
        window.localStorage.setItem(tenantCacheKey(CLAVE_FILTRO_RECIBOS), JSON.stringify(nuevo));
      } catch {
        /* sin persistencia */
      }
      return nuevo;
    });
  }, []);

  return [filtro, cambiar];
}
