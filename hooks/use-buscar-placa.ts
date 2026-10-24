"use client";

import { useCallback, useRef, useState } from "react";
import type { DatosPlacaExterna, LoQueSabeElSistema } from "@/lib/forestal/placa-historial";

/**
 * «Buscar placa» de la guía: `GET /api/admin/forestal/placa`. Devuelve lo que
 * el negocio ya sabe de la placa y, con clave, lo que dice SUNARP.
 *
 * Sólo el ÚLTIMO pedido cuenta: si se busca otra placa mientras la anterior
 * todavía no volvió, la respuesta vieja se descarta.
 */

export interface RespuestaPlaca {
  placa: { normalizada: string; formateada: string; tipo: "vehiculo" | "menor"; zona: string | null; aviso: string | null };
  sistema: LoQueSabeElSistema;
  externo: (DatosPlacaExterna & { consultadoEn: string }) | null;
  externoDisponible: boolean;
  externoEstado: "sin_clave" | "encontrada" | "no_encontrada" | "tope" | "omitida" | "error";
  externoMotivo: string | null;
}

export type EstadoBusquedaPlaca =
  | { fase: "quieto" }
  | { fase: "buscando"; placa: string }
  | { fase: "listo"; placa: string; respuesta: RespuestaPlaca }
  | { fase: "error"; placa: string; mensaje: string };

function esRespuesta(j: unknown): j is RespuestaPlaca {
  return Boolean(j && typeof j === "object" && "sistema" in j && "placa" in j && "externoEstado" in j);
}

export function useBuscarPlaca() {
  const [estado, setEstado] = useState<EstadoBusquedaPlaca>({ fase: "quieto" });
  const ultimo = useRef(0);

  const buscar = useCallback(async (placa: string): Promise<RespuestaPlaca | null> => {
    const n = ++ultimo.current;
    setEstado({ fase: "buscando", placa });
    try {
      const r = await fetch(`/api/admin/forestal/placa?placa=${encodeURIComponent(placa)}`, { credentials: "include" });
      let j: unknown = null;
      try {
        j = await r.json();
      } catch {
        // Un cuerpo que no es JSON (página de error del servidor): cae al mensaje con el código.
      }
      if (n !== ultimo.current) return null;
      if (!r.ok || !esRespuesta(j)) {
        const mensaje =
          j && typeof j === "object" && "message" in j && typeof j.message === "string"
            ? j.message
            : `No se pudo buscar la placa (${r.status}).`;
        setEstado({ fase: "error", placa, mensaje });
        return null;
      }
      setEstado({ fase: "listo", placa, respuesta: j });
      return j;
    } catch {
      if (n === ultimo.current) setEstado({ fase: "error", placa, mensaje: "Sin conexión: no se pudo buscar la placa." });
      return null;
    }
  }, []);

  const limpiar = useCallback(() => {
    ultimo.current++;
    setEstado({ fase: "quieto" });
  }, []);

  return { estado, buscar, limpiar };
}
