"use client";

/**
 * Mover un pedido de corrección de guía (ADR-512) desde la bandeja: PATCH a
 * `rutaEstadoCorreccionPlataforma(id)` con el estado y, para cerrar o
 * rechazar, la respuesta. Si otra persona lo movió recién (409
 * `cambio_concurrente`) o el paso ya no vale, se recarga la lista para que se
 * vea el estado de verdad.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  rutaEstadoCorreccionPlataforma,
  type CambiarEstadoCorreccionRespuesta,
  type EstadoCorreccion,
  type SolicitudCorreccionDTO,
} from "@/lib/soporte/correccion-guia";

export function useCambiarEstadoCorreccion({
  onHecho,
  onRecargar,
}: {
  onHecho: (s: SolicitudCorreccionDTO) => void;
  onRecargar: () => void | Promise<void>;
}) {
  const [enviando, setEnviando] = useState<EstadoCorreccion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = useCallback(
    async (id: string, estado: EstadoCorreccion, resolucion?: string): Promise<boolean> => {
      setEnviando(estado);
      setError(null);
      try {
        const r = await fetch(rutaEstadoCorreccionPlataforma(id), {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(resolucion?.trim() ? { estado, resolucion: resolucion.trim() } : { estado }),
        });
        const j = (await r.json().catch((err: unknown) => {
          console.warn("[sa-correccion] respuesta sin JSON", err);
          return null;
        })) as CambiarEstadoCorreccionRespuesta | null;
        if (r.ok && j?.ok) {
          onHecho(j.solicitud);
          return true;
        }
        const codigo = j && !j.ok ? j.codigo : undefined;
        if (codigo === "cambio_concurrente") {
          setError("Otra persona cambió este pedido recién. Ya ves su estado actual: revísalo y vuelve a intentar.");
          void onRecargar();
        } else if (codigo === "transicion_invalida" || codigo === "no_existe") {
          setError(`${j && !j.ok ? j.error : "Ese paso ya no vale"}. Recargué la lista con su estado actual.`);
          void onRecargar();
        } else {
          setError((j && !j.ok ? j.error : null) ?? `No se pudo cambiar el estado (${r.status}).`);
        }
        return false;
      } catch (err) {
        console.warn("[sa-correccion] falló el cambio de estado", err);
        setError("Sin conexión: el estado no cambió. Inténtalo de nuevo.");
        return false;
      } finally {
        setEnviando(null);
      }
    },
    [onHecho, onRecargar],
  );

  return { cambiar, enviando, error, limpiarError: () => setError(null) };
}
