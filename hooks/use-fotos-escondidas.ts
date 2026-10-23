"use client";

/**
 * useFotosEscondidas — las fotos de las cámaras (detector de personas y
 * asistencia) salen escondidas de las vistas generales del Archivo. Este hook
 * trae cuántas hay: un conteo barato, sin las fotos.
 */

import { useCallback, useEffect, useState } from "react";
import { cachedJson, cachedJsonVigente, invalidateCachedJson } from "@/lib/client-cache-fetch";
import {
  CONTEO_FOTOS_VACIO,
  TAGS_FOTOS_DE_MAQUINA,
  type ConteoFotosDeMaquina,
} from "@/lib/documents/fotos-de-maquina";

export interface UseFotosEscondidas {
  /** null mientras carga o si el pedido falló (la línea simplemente no aparece). */
  conteo: ConteoFotosDeMaquina | null;
  /** Vuelve a contar (después de subir o borrar). */
  recargar: () => void;
}

const URL_CONTEO = `/api/admin/documents?${new URLSearchParams({ conteo: "1", tags: TAGS_FOTOS_DE_MAQUINA.join(",") }).toString()}`;
/**
 * Volver al Archivo antes de esto no vuelve a contar (22-10: era 1 de los 8
 * pedidos de cada apertura). Subir o borrar desde el panel lo borra solo (el
 * envoltorio de `cachedJson` invalida /api/admin/documents al escribir).
 */
const FRESCO_MS = 60_000;
/** Lo último sabido se pinta al volver aunque tenga unos minutos: es un número, se corrige detrás. */
const PINTABLE_MS = 10 * 60_000;

type RespuestaConteo = { conteo?: Partial<ConteoFotosDeMaquina> };

function leer(j: RespuestaConteo | null | undefined): ConteoFotosDeMaquina | null {
  if (!j?.conteo) return null;
  return {
    total: Number(j.conteo.total) || 0,
    bytes: Number(j.conteo.bytes) || 0,
    porTag: j.conteo.porTag ?? CONTEO_FOTOS_VACIO.porTag,
  };
}

export function useFotosEscondidas(): UseFotosEscondidas {
  const [conteo, setConteo] = useState<ConteoFotosDeMaquina | null>(() =>
    leer(cachedJsonVigente<RespuestaConteo | null>(URL_CONTEO, PINTABLE_MS)),
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    // Sin red o con error: queda lo que había (null la primera vez: no se esconde ni se avisa nada).
    void cachedJson<RespuestaConteo>(URL_CONTEO, FRESCO_MS).then((j) => {
      const c = leer(j);
      if (vivo && c) setConteo(c);
    });
    return () => {
      vivo = false;
    };
  }, [version]);

  const recargar = useCallback(() => {
    invalidateCachedJson(URL_CONTEO);
    setVersion((v) => v + 1);
  }, []);

  return { conteo, recargar };
}
