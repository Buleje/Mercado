"use client";

/**
 * useFotosEscondidas — las fotos de las cámaras (detector de personas y
 * asistencia) salen escondidas de las vistas generales del Archivo. Este hook
 * trae cuántas hay: un conteo barato, sin las fotos.
 */

import { useCallback, useEffect, useState } from "react";
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

export function useFotosEscondidas(): UseFotosEscondidas {
  const [conteo, setConteo] = useState<ConteoFotosDeMaquina | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ctl = new AbortController();
    void (async () => {
      try {
        const qs = new URLSearchParams({ conteo: "1", tags: TAGS_FOTOS_DE_MAQUINA.join(",") });
        const r = await fetch(`/api/admin/documents?${qs.toString()}`, {
          credentials: "include",
          signal: ctl.signal,
        });
        if (!r.ok) return;
        const j = (await r.json()) as { conteo?: Partial<ConteoFotosDeMaquina> };
        if (!vivo || !j.conteo) return;
        setConteo({
          total: Number(j.conteo.total) || 0,
          bytes: Number(j.conteo.bytes) || 0,
          porTag: j.conteo.porTag ?? CONTEO_FOTOS_VACIO.porTag,
        });
      } catch (err) {
        // Cancelado al desmontar o sin red: sin el dato no se esconde ni se avisa nada.
        if (!(err instanceof DOMException && err.name === "AbortError")) setConteo(null);
      }
    })();
    return () => {
      vivo = false;
      ctl.abort();
    };
  }, [version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { conteo, recargar };
}
