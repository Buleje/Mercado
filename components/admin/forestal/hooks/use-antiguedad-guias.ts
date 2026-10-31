"use client";

/**
 * useAntiguedadGuias — las guías del libro con saldo sin consumir (Aging).
 *
 * Antes el pedido vivía adentro de `CtpPatioAging`, con su propio «Recargar»:
 * la pantalla tenía dos botones con el mismo nombre y ninguno refrescaba todo,
 * y «Qué revisar» no podía avisar de la madera varada ni de la sin costo porque
 * el dato estaba encerrado en un bloque de otra pestaña. Ahora lo pide el
 * orquestador UNA vez y lo reparte.
 *
 * `/ctp?available=produccion` no lee `contratoId`: es de toda la planta, y el
 * aviso de alcance lo dice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { GuiaDisponible } from "@/lib/forestal/antiguedad-por-guia";
import type { EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import { logger } from "@/lib/logger";

const URL_AGING = "/api/admin/forestal/ctp?available=produccion";

export interface AntiguedadGuias {
  guias: GuiaDisponible[];
  estado: EstadoFuente;
  error: string | null;
  recargar: () => void;
}

export function useAntiguedadGuias(): AntiguedadGuias {
  const [guias, setGuias] = useState<GuiaDisponible[]>([]);
  const [estado, setEstado] = useState<EstadoFuente>("cargando");
  const [error, setError] = useState<string | null>(null);
  /* Sólo la última respuesta escribe: un «Recargar» apretado dos veces no
     puede terminar mostrando la primera. */
  const pedido = useRef(0);

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    setEstado("cargando");
    setError(null);
    ctpGet<{ items?: GuiaDisponible[] }>(URL_AGING)
      .then((j) => {
        if (n !== pedido.current) return;
        setGuias(Array.isArray(j?.items) ? j.items : []);
        setEstado("ok");
      })
      .catch((err) => {
        if (n !== pedido.current) return;
        logger.warn("[ctp-saldos] antigüedad no cargó", { error: String(err) });
        setError(err instanceof Error ? err.message : String(err));
        setEstado("error");
      });
  }, []);

  useEffect(() => {
    cargar();
    return () => {
      pedido.current += 1;
    };
  }, [cargar]);

  const recargar = useCallback(() => {
    invalidarCtp("available=produccion");
    cargar();
  }, [cargar]);

  return { guias, estado, error, recargar };
}
