"use client";

/**
 * Las respuestas de la revisión de «Guías sin registrar» (ADR-446, 26-10):
 * elegir el papel que viajó, decir que el mismo papel salió dos veces, deshacer
 * un «reemplazado» o contestar un hueco del talonario. Cada respuesta es UN
 * PATCH que nunca escribe en el libro; al volver, la lista se relee.
 */
import { useCallback, useState } from "react";
import type { ResultadoRevision } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { pedir } from "./guias-sin-registrar-pedidos";

export type PedidoDeRevision =
  | { accion: "resolver"; duda: string; opcion: string }
  | { accion: "deshacer"; anexoId: string }
  | { accion: "responder"; clave: string; valor: string | null };

export interface RevisionDeSalidas {
  /** La pregunta que se está mandando (su clave), para poner el reloj en su botón. */
  enviando: string | null;
  error: { clave: string; mensaje: string } | null;
  enviar: (clave: string, pedido: PedidoDeRevision) => Promise<boolean>;
}

export function useRevisionDeSalidas(alTerminar: () => Promise<void>): RevisionDeSalidas {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<RevisionDeSalidas["error"]>(null);

  const enviar = useCallback(
    async (clave: string, pedido: PedidoDeRevision) => {
      setEnviando(clave);
      setError(null);
      const r = await pedir<ResultadoRevision>("PATCH", pedido);
      if (!r.ok) {
        setEnviando(null);
        setError({ clave, mensaje: r.mensaje });
        /* Otra pestaña ya la contestó: la lista de ahora dice lo que quedó. */
        if (r.codigo === "DUDA_DESACTUALIZADA") await alTerminar();
        return false;
      }
      await alTerminar();
      setEnviando(null);
      return true;
    },
    [alTerminar],
  );

  return { enviando, error, enviar };
}
